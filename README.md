# node-red-contrib-easye4-mqtt

**[English](#english) | [Deutsch](#deutsch)**

Node-RED nodes for the **Eaton easyE4** (firmware 2.40 or later) via its universal MQTT interface.
Node-RED-Knoten für die **Eaton easyE4** (Firmware ab 2.40) über die universelle MQTT-Anbindung.

> **⚠ Use at your own risk / Benutzung auf eigene Gefahr**
>
> This software controls real machines (writing operands, RUN/STOP, program and firmware updates).
> It is provided "as is" under the MIT license, **without any warranty and without any liability** for damage
> to persons, machines, installations or data. Never let safety functions depend on it.
> Unofficial project, not affiliated with or endorsed by Eaton.
>
> Diese Software steuert reale Maschinen (Operanden schreiben, RUN/STOP, Programm- und Firmware-Updates).
> Sie wird unter der MIT-Lizenz „wie besehen“ bereitgestellt, **ohne Gewährleistung und ohne jegliche Haftung**
> für Schäden an Personen, Maschinen, Anlagen oder Daten. Sicherheitsfunktionen dürfen nie davon abhängen.
> Inoffizielles Projekt, nicht von Eaton.

---

## English

The editor dialogs, help texts and messages are available in English and German. Node-RED chooses the language
automatically (browser language or *User Settings → View → Language*).

| Node | Purpose |
|---|---|
| **easyE4** (config) | Controller: MQTT broker + one base topic, once per controller |
| **easyE4 read** | Read an operand (type + index, e.g. `MW` `3`, or alias) |
| **easyE4 write** | Write an operand |
| **easyE4 action** | RUN/STOP, function blocks (type + index), program and firmware update |

The nodes appear in their own palette category **easyE4**.

### Installation

In Node-RED: *Menu → Manage palette → Install*, search for `node-red-contrib-easye4-mqtt`, click *Install*.

Or on the command line:

```
cd ~/.node-red
npm install node-red-contrib-easye4-mqtt
node-red-restart
```

An importable example is available under *Menu → Import → Examples*.

### Setup

1. In easySoft 8 configure the broker connection (MQTT broker access, steps 1–3) and assign the four topics.
2. On the *Cyclic data* tab add the operands and mark them as *writable* if needed.
3. On the *MQTT settings* tab enable only the actions you need.
4. In Node-RED drag an *easyE4 read* node into the flow, click the pencil icon next to *Controller*, create the
   MQTT broker (server/port, TLS if required) and enter a **base topic** (e.g. `easye4/1`). The dialog shows a table
   of the four topics to enter in easySoft 8 (`<base>/data`, `/set`, `/actions/request`, `/actions/response`).
   Custom topic names are possible with *Individual*.
5. Use QoS 0: the easyE4 does not accept write requests with QoS 1 (firmware 2.46).

### Usage

- **easyE4 read:** select the controller, the operand type (e.g. `MW – Marker (word)`) and the index.
  `msg.payload` is the value, `msg.topic` the operand name. *All operands* outputs everything as one object.
- **easyE4 write:** select controller, operand type and index, send the value in `msg.payload` (number or `true`/`false`).
  With *From the message*: `msg.topic` = operand or `msg.payload = { M5: 1, MW3: 42 }`.
  Non-writable operands are not offered in the dialog (Q, QA) or only from the first free index (I17, IA5, ID26).
- **easyE4 action:** select the action in the dialog (or use `msg.action`); for function blocks select type and index;
  send a message to the input. The response arrives at the output with `msg.success`, `msg.errorMsg` and `msg.response`.

### Status

Below the nodes you can see whether the easyE4 is online: green (online or current value), red "easyE4 offline" or grey
"device unknown". It is based on the `connected` message of the easyE4 (last will via the broker). After switching
off the controller it takes up to 1.5 keep-alive periods (up to 90 s at 60 s) until "offline" appears. After a
Node-RED restart the status stays grey until the easyE4 sends its next message.

### TLS certificates (optional)

The package contains the script `tools/easye4-zertifikate.sh` (messages in German). On the Raspberry Pi it creates
your own certificate authority (CA) and the server certificate for Mosquitto, within the limits of the easyE4
(CA file at most 1728 bytes, IP address as both IP and DNS entry). Replace `192.168.1.50` with the IP address of the Pi:

```
bash ~/.node-red/node_modules/node-red-contrib-easye4-mqtt/tools/easye4-zertifikate.sh 192.168.1.50 raspberrypi.local
```

The files are written to `~/mqtt-zertifikate`: select `ca.crt` in easySoft 8 as *Broker CA certificate* and use it
for Mosquitto (`cafile`); `server.crt`/`server.key` are for Mosquitto (`certfile`/`keyfile`). Keep `ca.key` and
`server.key` secret. For mutual TLS, `bash .../easye4-zertifikate.sh sign <file.csr>` signs the CSR created in easySoft 8.

### Notes

- Operands are only sent in RUN mode.
- Q, QA, I1–I16, IA1–IA4 and ID1–ID25 cannot be written via MQTT; the node rejects them.
- `M1` and `M001` are treated as the same operand when reading.
- Function block changes are temporary; use the action *Save FB changes* to make them permanent.
- Commands are never sent with retain.

### Upgrading from version 3

Existing flows keep working: old nodes with a text field "operand" and individually entered topics are converted
to type + index or shown as *Individual* when the dialog is opened.

### License

MIT – see [LICENSE](LICENSE). Use at your own risk, no liability – see the [safety and liability notice](HINWEIS.md).

### Bugs and questions

Please report problems at [GitHub Issues](https://github.com/cieslera/node-red-contrib-easye4-mqtt/issues).

---

## Deutsch

Die Dialoge, Hilfetexte und Meldungen gibt es auf Deutsch und Englisch. Node-RED wählt die Sprache automatisch
(Sprache des Browsers oder *Benutzereinstellungen → Ansicht → Sprache*).

| Knoten | Aufgabe |
|---|---|
| **easyE4** (Konfiguration) | Steuerung: MQTT-Broker + ein Basis-Topic, einmal pro Steuerung |
| **easyE4 lesen** | Operand lesen (Typ + Index, z. B. `MW` `3`, oder Alias) |
| **easyE4 schreiben** | Operand schreiben |
| **easyE4 aktion** | RUN/STOP, Funktionsbausteine (Typ + Index), Programm- und Firmware-Update |

Die Knoten erscheinen in der Palette in der eigenen Kategorie **easyE4**.

### Installation

In Node-RED: *Menü → Palette verwalten → Installation*, nach `node-red-contrib-easye4-mqtt` suchen, *Installieren* klicken.

Oder in der Kommandozeile:

```
cd ~/.node-red
npm install node-red-contrib-easye4-mqtt
node-red-restart
```

Ein importierbares Beispiel liegt unter *Menü → Import → Beispiele*.

### Einrichtung

1. In easySoft 8 die Broker-Verbindung konfigurieren (MQTT Broker-Zugang, Schritt 1–3) und die vier Topics vergeben.
2. Im Register *Zyklische Daten* die Operanden anlegen und ggf. als *beschreibbar* markieren.
3. Im Register *MQTT Einstellungen* nur die Aktionen freigeben, die benötigt werden.
4. In Node-RED einen Knoten *easyE4 lesen* ziehen, bei *Steuerung* das Stift-Symbol drücken, den MQTT-Broker anlegen
   (Server/Port, ggf. TLS) und ein **Basis-Topic** eintragen (z. B. `easye4/1`). Der Dialog zeigt als Tabelle, welche
   vier Topics in easySoft 8 einzutragen sind (`<Basis>/data`, `/set`, `/actions/request`, `/actions/response`).
   Eigene Topic-Namen sind über *Einzeln* möglich.
5. QoS 0 verwenden: Die easyE4 übernimmt Schreibzugriffe mit QoS 1 nicht (Firmware 2.46).

### Benutzung

- **easyE4 lesen:** Steuerung wählen, Operandentyp (z. B. `MW – Merker (Wort)`) und Index wählen, fertig.
  `msg.payload` ist der Wert, `msg.topic` der Operandenname. *Alle Operanden* gibt alles als Objekt aus.
- **easyE4 schreiben:** Steuerung, Operandentyp und Index wählen, Wert per `msg.payload` senden (Zahl oder `true`/`false`).
  Bei *Aus der Nachricht*: `msg.topic` = Operand oder `msg.payload = { M5: 1, MW3: 42 }`.
  Nicht beschreibbare Operanden gibt es im Dialog nicht (Q, QA) bzw. erst ab dem ersten freien Index (I17, IA5, ID26).
- **easyE4 aktion:** Aktion im Dialog wählen (oder `msg.action`), bei Funktionsbausteinen Typ und Index wählen,
  Nachricht an den Eingang senden.
  Die Antwort kommt am Ausgang mit `msg.success`, `msg.errorMsg` und `msg.response`.

### Statusanzeige

Unter den Knoten steht, ob die easyE4 online ist: grün (online bzw. aktueller Wert), rot "easyE4 offline" oder grau
"Gerät unbekannt". Grundlage ist die `connected`-Meldung der easyE4 (Letzter Wille des Brokers). Nach dem Ausschalten
der Steuerung dauert es bis zu 1,5 Keep-Alive-Zeiten (bei 60 s bis zu 90 s), bis "offline" erscheint. Nach einem
Neustart von Node-RED bleibt die Anzeige grau, bis die easyE4 die nächste Meldung sendet.

### Zertifikate für TLS (optional)

Im Paket liegt das Skript `tools/easye4-zertifikate.sh`. Es erzeugt auf dem Raspberry Pi eine eigene
Zertifizierungsstelle (CA) und das Serverzertifikat für Mosquitto, passend zu den Grenzen der easyE4
(CA-Datei höchstens 1728 Bytes, IP-Adresse als IP- und Namenseintrag). Statt `192.168.1.50` die IP-Adresse des Pi
eintragen:

```
bash ~/.node-red/node_modules/node-red-contrib-easye4-mqtt/tools/easye4-zertifikate.sh 192.168.1.50 raspberrypi.local
```

Die Dateien landen in `~/mqtt-zertifikate`: `ca.crt` in easySoft 8 als *Broker CA Zertifikat* wählen und für
Mosquitto verwenden (`cafile`), `server.crt`/`server.key` für Mosquitto (`certfile`/`keyfile`). `ca.key` und
`server.key` geheim halten. Für Mutual TLS signiert `bash .../easye4-zertifikate.sh sign <datei.csr>` die in
easySoft 8 erzeugte CSR-Datei.

### Hinweise

- Operanden werden nur im Zustand RUN gesendet.
- Q, QA, I1–I16, IA1–IA4 und ID1–ID25 sind über MQTT nicht beschreibbar; der Knoten lehnt sie ab.
- `M1` und `M001` gelten beim Lesen als derselbe Operand.
- Funktionsbaustein-Änderungen wirken nur temporär; mit der Aktion *FB-Änderungen speichern* werden sie dauerhaft.
- Befehle werden nie mit Retain gesendet.

### Update von Version 3

Bestehende Flows laufen weiter: alte Knoten mit Textfeld "Operand" und einzeln eingetragenen Topics werden beim Öffnen
des Dialogs automatisch in Typ + Index umgesetzt bzw. als *Einzeln* angezeigt.

### Lizenz

MIT – siehe [LICENSE](LICENSE). Benutzung auf eigene Gefahr, keinerlei Haftung – siehe [Sicherheits- und Haftungshinweis](HINWEIS.md).

### Fehler und Fragen

Probleme bitte unter [GitHub Issues](https://github.com/cieslera/node-red-contrib-easye4-mqtt/issues) melden.
