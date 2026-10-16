# Changelog

## 4.1.4

- Added repository, bug tracker and homepage links (GitHub). No functional changes.
  / Links zu Repository, Fehlermeldungen und Homepage (GitHub) ergänzt. Keine Änderung an der Funktion.

## 4.1.3

- The topic table in the device dialog and the help now list the topics in the same order as easySoft 8
  (Publish, Subscribe, Actions publish, Actions subscribe). Before, the two action topics were swapped, which made
  it easy to paste them into the wrong easySoft fields; actions then got no reaction from the easyE4.
  / Die Topic-Tabelle im Gerätedialog und die Hilfe zeigen die Topics jetzt in derselben Reihenfolge wie easySoft 8
  (Publish, Subscribe, Actions publish, Actions subscribe). Vorher waren die beiden Aktions-Topics vertauscht; beim
  Kopieren landeten sie leicht im falschen easySoft-Feld, und die easyE4 reagierte dann nicht auf Aktionen.
- Note on 4.1.2: The request IDs are now unique, but the "ignored" behaviour described there was not the cause of
  the reported problem (it was the swapped topics). / Hinweis zu 4.1.2: Die IDs sind jetzt eindeutig, das dort
  beschriebene „Ignorieren“ war aber nicht die Ursache des gemeldeten Fehlers (das waren die vertauschten Topics).

## 4.1.2

- Fixed: action nodes could create identical request IDs (each node counted from 1 with the same time prefix).
  The easyE4 then ignored e.g. Start after Stop or Set_FB_Config after Get_FB_Config, and answers could reach
  the wrong node. IDs are now unique across all action nodes.
  / Behoben: Aktions-Knoten konnten gleiche Anfrage-IDs erzeugen (jeder Knoten zählte ab 1 mit demselben
  Zeitpräfix). Die easyE4 ignorierte dann z. B. Start nach Stop oder Set_FB_Config nach Get_FB_Config, und Antworten
  konnten beim falschen Knoten landen. Die IDs sind jetzt über alle Aktions-Knoten eindeutig.

## 4.1.1

- Added the helper script `tools/easye4-zertifikate.sh` to create a CA and server certificate for Mosquitto (TLS)
  that the easyE4 accepts, and to sign the device certificate for mutual TLS.
  / Hilfsskript `tools/easye4-zertifikate.sh` ergänzt: erzeugt CA und Serverzertifikat für Mosquitto (TLS) passend
  zur easyE4 und signiert das Gerätezertifikat für Mutual TLS.

## 4.1.0

- Editor, help texts and runtime messages in English and German (follows the Node-RED language setting).
  / Editor, Hilfetexte und Laufzeitmeldungen auf Englisch und Deutsch (richtet sich nach der Sprache von Node-RED).
- Added LICENSE file and disclaimer (use at your own risk, no liability).
  / LICENSE-Datei und Haftungsausschluss ergänzt (Benutzung auf eigene Gefahr, keine Haftung).
- Package prepared for the Node-RED flow library / palette manager.
  / Paket für die Node-RED-Bibliothek bzw. den Palettenmanager vorbereitet.

## 4.0.2

- Last German-only version. / Letzte rein deutsche Version.
