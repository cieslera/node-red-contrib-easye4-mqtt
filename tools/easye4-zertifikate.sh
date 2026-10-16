#!/usr/bin/env bash
# Erzeugt eine eigene Zertifizierungsstelle (CA) und ein Serverzertifikat für Mosquitto,
# und signiert auf Wunsch das Gerätezertifikat (CSR) der easyE4 für Mutual TLS.
#
#   ./easye4-zertifikate.sh <IP-oder-Name> [weitere IPs/Namen ...]
#   ./easye4-zertifikate.sh sign <datei.csr>
#
# Alle Dateien landen in ~/mqtt-zertifikate (änderbar mit E4_CERT_DIR=/anderer/pfad).
set -euo pipefail

DIR="${E4_CERT_DIR:-$HOME/mqtt-zertifikate}"
DAYS_CA=3650     # CA: 10 Jahre
DAYS_CERT=1825   # Server-/Gerätezertifikate: 5 Jahre
MAX_CA_BYTES=1728 # größte CA-Datei, die easySoft 8 / die easyE4 annimmt

usage() {
    cat << 'EOF'
Aufruf:
  easye4-zertifikate.sh <IP-oder-Name> [weitere IPs/Namen ...]
      Erzeugt CA (ca.crt) und Serverzertifikat (server.crt/server.key).
      Gib die Adresse(n) an, unter der die easyE4 den Broker erreicht, z. B.:
        ./easye4-zertifikate.sh 192.168.1.50 raspberrypi.local

  easye4-zertifikate.sh sign <datei.csr>
      Signiert die in easySoft 8 erzeugte CSR-Datei (nur für Mutual TLS)
      und erzeugt das Gerätezertifikat <datei>.crt.
EOF
}

command -v openssl > /dev/null || { echo "openssl ist nicht installiert (sudo apt install openssl)"; exit 1; }

create_all() {
    local cn="$1" san="" n
    for n in "$@"; do
        [[ -n "$san" ]] && san+=","
        # IPs kommen als IP-Eintrag UND als Namenseintrag ins Zertifikat: manche kleinen TLS-Bibliotheken
        # (z. B. in Steuerungen) vergleichen die URL nur mit den Namenseinträgen
        if [[ "$n" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then san+="IP:$n,DNS:$n"; else san+="DNS:$n"; fi
    done

    mkdir -p "$DIR"
    chmod 700 "$DIR"
    cd "$DIR"

    # Eine zu große CA (z. B. aus einer früheren Version mit 4096 Bit) wird gesichert und ersetzt
    if [[ -f ca.key && -f ca.crt ]] && (( $(wc -c < ca.crt) > MAX_CA_BYTES )); then
        local alt="alt-$(date +%Y%m%d-%H%M%S)"
        echo "Die vorhandene CA ist mit $(wc -c < ca.crt) Bytes zu groß für die easyE4 (max. $MAX_CA_BYTES)."
        echo "Sie wird nach $DIR/$alt gesichert und durch eine kleinere ersetzt."
        mkdir "$alt"
        mv ca.key ca.crt ca.srl server.* "$alt"/ 2> /dev/null || true
    fi

    if [[ -f ca.key && -f ca.crt ]]; then
        echo "Vorhandene CA wird weiterverwendet ($DIR/ca.crt)."
    else
        echo "Erzeuge CA ..."
        openssl genrsa -out ca.key 2048 2> /dev/null
        openssl req -x509 -new -key ca.key -sha256 -days "$DAYS_CA" \
            -subj "/CN=easyE4 MQTT CA" \
            -addext "basicConstraints=critical,CA:TRUE" \
            -addext "keyUsage=critical,keyCertSign,cRLSign" \
            -out ca.crt
        chmod 600 ca.key
    fi

    local size
    size=$(wc -c < ca.crt)
    echo "ca.crt ist $size Bytes groß (Grenze der easyE4: $MAX_CA_BYTES)."
    if (( size > MAX_CA_BYTES )); then
        echo "WARNUNG: ca.crt ist zu groß für die easyE4."
    fi

    echo "Erzeuge Serverzertifikat für: $san"
    openssl genrsa -out server.key 2048 2> /dev/null
    openssl req -new -key server.key -subj "/CN=$cn" -out server.csr
    cat > server.ext << EOF
subjectAltName=$san
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
    openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
        -out server.crt -days "$DAYS_CERT" -sha256 -extfile server.ext 2> /dev/null
    chmod 600 server.key
    rm -f server.csr server.ext

    echo
    openssl verify -CAfile ca.crt server.crt
    echo
    echo "Fertig. Dateien in $DIR:"
    echo "  ca.crt      -> in easySoft 8 als 'Broker CA Zertifikat' wählen, außerdem für Mosquitto (cafile)"
    echo "  server.crt  -> Mosquitto (certfile)"
    echo "  server.key  -> Mosquitto (keyfile), GEHEIM, nur auf dem Pi lassen"
    echo "  ca.key      -> GEHEIM, nirgendwohin kopieren"
}

sign_client() {
    local csr="$1" name
    [[ -f "$csr" ]] || { echo "CSR-Datei nicht gefunden: $csr"; exit 1; }
    [[ -f "$DIR/ca.crt" && -f "$DIR/ca.key" ]] || { echo "Keine CA in $DIR. Zuerst Zertifikate erzeugen."; exit 1; }
    name="$(basename "${csr%.*}")"
    echo "Signiere Gerätezertifikat für: $(openssl req -in "$csr" -noout -subject)"
    cat > "$DIR/client.ext" << 'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature
extendedKeyUsage=clientAuth
EOF
    openssl x509 -req -in "$csr" -CA "$DIR/ca.crt" -CAkey "$DIR/ca.key" -CAcreateserial \
        -out "$DIR/$name.crt" -days "$DAYS_CERT" -sha256 -extfile "$DIR/client.ext" 2> /dev/null
    rm -f "$DIR/client.ext"
    openssl verify -CAfile "$DIR/ca.crt" "$DIR/$name.crt"
    echo "Gerätezertifikat: $DIR/$name.crt -> in easySoft 8 bei 'Gerätezertifikat hochladen' wählen."
}

case "${1:-}" in
    "" | -h | --help) usage ;;
    sign) [[ $# -eq 2 ]] || { usage; exit 1; }; sign_client "$2" ;;
    *) create_all "$@" ;;
esac
