module.exports = function (RED) {
    "use strict";

    // Aktionsname (nicht case-sensitiv) -> Operation laut Eaton-Doku
    const ACTIONS = new Map([
        ["start", "StartDevice"], ["startdevice", "StartDevice"],
        ["stop", "StopDevice"], ["stopdevice", "StopDevice"],
        ["getfb", "Get_FB_Config"], ["get_fb_config", "Get_FB_Config"],
        ["setfb", "Set_FB_Config"], ["set_fb_config", "Set_FB_Config"],
        ["savefb", "Save_FB_Const_Par"], ["save_fb_const_par", "Save_FB_Const_Par"],
        ["loadproject", "LoadProject"],
        ["updatefirmware", "UpdateFirmware"],
    ]);
    const ACTION_NAMES = "start, stop, getFB, setFB, saveFB, loadProject, updateFirmware";

    // Eindeutige Anfrage-IDs für ALLE Aktions-Knoten gemeinsam. Früher zählte jeder Knoten selbst ab 1 mit einem
    // Zeitstempel als Präfix; Knoten, die in derselben Millisekunde starteten, erzeugten dadurch gleiche IDs
    // (z. B. Stop und Start). Die easyE4 führt eine bereits verwendete ID nicht erneut aus, und Antworten wurden
    // dem falschen Knoten zugeordnet.
    // Unique request IDs shared by all action nodes (see above).
    const ID_PREFIX = "nr" + Date.now().toString(36) + require("crypto").randomBytes(2).toString("hex");
    let idCounter = 0;
    function newActionId() {
        idCounter += 1;
        return ID_PREFIX + "-" + idCounter.toString(36);
    }

    const OPERAND_LIKE = /^[A-Za-z]{1,2}0*\d+$/; // M1, MW3, I17 ...
    const BIT_OPERAND = /^[MN]0*\d+$/i;          // Bit-Merker (BOOL)

    // ---------------------------------------------------------------- Hilfsfunktionen

    // Laut easyE4-Doku: max. 511 Zeichen, "+" und "#" nicht erlaubt
    function validTopic(t) {
        return typeof t === "string" && t.length > 0 && t.length <= 511 && !/[#+]/.test(t);
    }

    function isPlainObject(v) {
        return v !== null && typeof v === "object" && !Array.isArray(v) && !Buffer.isBuffer(v);
    }

    function tryParse(raw) {
        const s = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
        try {
            return { ok: true, value: JSON.parse(s) };
        } catch (e) {
            return { ok: false, value: s };
        }
    }

    // M1, m1 und M001 gelten als derselbe Operand; Aliase werden exakt verglichen
    function normName(n) {
        const s = String(n).trim();
        const m = /^([A-Za-z]{1,2})0*(\d+)$/.exec(s);
        return m ? m[1].toUpperCase() + parseInt(m[2], 10) : s;
    }

    // {"state": {"reported": {...}}} -> reported-Objekt, sonst null
    function getReported(parsed) {
        const v = parsed.value;
        return parsed.ok && isPlainObject(v) && isPlainObject(v.state) && isPlainObject(v.state.reported)
            ? v.state.reported
            : null;
    }

    // Nicht beschreibbare Operanden laut Doku (das Gerät würde sie stillschweigend ignorieren)
    function checkWritable(name) {
        const m = /^(QA|Q|IA|ID|I)0*(\d+)$/i.exec(name);
        if (!m) return;
        const type = m[1].toUpperCase();
        const n = parseInt(m[2], 10);
        if (type === "Q" || type === "QA") {
            throw new Error(RED._("easye4.errors.outputNotWritable", { name }));
        }
        if ((type === "I" && n <= 16) || (type === "IA" && n <= 4) || (type === "ID" && n <= 25)) {
            throw new Error(RED._("easye4.errors.reserved", { name }));
        }
    }

    function convertValue(name, v, boolAsNumber) {
        let x = v;
        if (typeof x === "string") {
            const t = x.trim().toLowerCase();
            if (t === "true" || t === "false") x = t === "true";
            else if (t !== "" && Number.isFinite(Number(t))) x = Number(t);
        }
        if (typeof x === "boolean") {
            if (boolAsNumber) x = x ? 1 : 0;
        } else if (typeof x !== "number" || !Number.isFinite(x)) {
            throw new Error(RED._("easye4.errors.invalidValue", { name }));
        }
        if (OPERAND_LIKE.test(name)) {
            if (typeof x === "number" && !Number.isInteger(x)) {
                throw new Error(RED._("easye4.errors.integer", { name }));
            }
            if (BIT_OPERAND.test(name) && !(x === 0 || x === 1 || typeof x === "boolean")) {
                throw new Error(RED._("easye4.errors.bit", { name }));
            }
        }
        return x;
    }

    // {"state": {"<Operand oder Alias>": <Wert>}}
    function buildState(msg, operand, boolAsNumber) {
        const p = msg.payload;
        const topicName = typeof msg.topic === "string" ? msg.topic.trim() : "";
        let raw;
        if (operand) {
            if (p === undefined) throw new Error(RED._("easye4.errors.payloadMissing"));
            raw = { [operand]: p };
        } else if (isPlainObject(p)) {
            raw = isPlainObject(p.state) ? p.state : p;
        } else if (topicName) {
            if (p === undefined) throw new Error(RED._("easye4.errors.payloadMissing"));
            raw = { [topicName]: p };
        } else {
            throw new Error(RED._("easye4.errors.noOperand"));
        }
        const keys = Object.keys(raw);
        if (keys.length === 0) throw new Error(RED._("easye4.errors.noOperands"));
        const state = {};
        keys.forEach((k) => {
            checkWritable(k);
            state[k] = convertValue(k, raw[k], boolAsNumber);
        });
        return { state };
    }

    function fbRef(p, defaults) {
        const fbtype = p.fbtype !== undefined ? p.fbtype : defaults.fbtype;
        const rawIndex = p.index !== undefined ? p.index : defaults.index;
        if (typeof fbtype !== "string" || fbtype.trim() === "") {
            throw new Error(RED._("easye4.errors.fbTypeMissing"));
        }
        const index = typeof rawIndex === "string" && rawIndex.trim() !== "" ? Number(rawIndex) : rawIndex;
        if (!Number.isInteger(index) || index < 0) {
            throw new Error(RED._("easye4.errors.fbIndexInvalid"));
        }
        return { fbtype: fbtype.trim(), index };
    }

    function buildAction(op, payload, defaults, id) {
        const p = isPlainObject(payload) ? payload : {};
        const action = { id, operation: op };
        switch (op) {
            case "StartDevice":
            case "StopDevice":
            case "Save_FB_Const_Par":
                break;
            case "LoadProject":
            case "UpdateFirmware": {
                const url = typeof payload === "string" ? payload : p.url;
                if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
                    throw new Error(RED._("easye4.errors.urlMissing"));
                }
                action.url = url;
                break;
            }
            case "Get_FB_Config":
                Object.assign(action, fbRef(p, defaults));
                break;
            case "Set_FB_Config": {
                Object.assign(action, fbRef(p, defaults));
                let request;
                if (isPlainObject(p.request)) {
                    request = p.request;
                } else {
                    // Kurzform: msg.payload ist direkt die Anforderung, z. B. {A: {h: 10, min: 33}}
                    request = Object.assign({}, p);
                    delete request.fbtype;
                    delete request.index;
                }
                if (Object.keys(request).length === 0) {
                    throw new Error(RED._("easye4.errors.requestMissing"));
                }
                action.request = request;
                break;
            }
        }
        return action;
    }

    // Operand aus den Dialogfeldern: Typ (+ Index) oder Alias. Ältere Flows kennen nur das Textfeld "operand".
    // Rückgabe: null = kein fester Operand (in: alle, out: aus der Nachricht), sonst der Operandenname.
    const OPERAND_TYPES = /^(MB|MW|MD|NB|NW|ND|QA|IA|ID|M|N|I|Q)$/;
    function resolveOperand(config) {
        const type = config.operandType;
        if (type === undefined || type === "") return (config.operand || "").trim() || null;
        if (type === "all" || type === "msg") return null;
        if (type === "alias") {
            const a = String(config.operandAlias || "").trim();
            if (!a) throw new Error(RED._("easye4.errors.aliasMissing"));
            return a;
        }
        if (!OPERAND_TYPES.test(type)) throw new Error(RED._("easye4.errors.unknownOperandType", { type }));
        const idx = Number(String(config.operandIndex === undefined ? "" : config.operandIndex).trim());
        if (String(config.operandIndex === undefined ? "" : config.operandIndex).trim() === "" || !Number.isInteger(idx) || idx < 1) {
            throw new Error(RED._("easye4.errors.indexInvalid"));
        }
        return type + idx;
    }

    // Gemeinsamer Start für alle Knoten: Gerät prüfen, beim Broker anmelden
    function attach(node, config, needKey, needText) {
        const dev = RED.nodes.getNode(config.device);
        let problem = null;
        if (!dev) problem = RED._("easye4.errors.noDevice");
        else if (dev.problem) problem = dev.problem;
        else if (needKey && !dev[needKey]) problem = needText;
        if (problem) {
            node.status({ fill: "red", shape: "ring", text: problem.length > 40 ? problem.slice(0, 37) + "..." : problem });
            node.error(problem);
            return null;
        }
        // Statusanzeige: Der Broker meldet nur, ob Node-RED am Broker hängt. Ob die easyE4 selbst online ist,
        // wertet das Gerät aus ihren connected-Meldungen aus (dev.state). Der Broker ruft node.status() auf;
        // das wird hier abgefangen und mit dem Gerätestatus zusammengeführt.
        const raw = node.status.bind(node);
        let brokerOk = !!dev.broker.connected;
        let brokerStatus = { fill: "yellow", shape: "ring", text: RED._("easye4.status.connecting") };
        node.e4Value = null; // zuletzt gezeigter Wert (easyE4 in mit festem Operand)
        function render() {
            if (!brokerOk) return raw(brokerStatus);
            if (dev.state === "offline") return raw({ fill: "red", shape: "ring", text: RED._("easye4.status.offline") });
            if (dev.state === "online") {
                return raw({ fill: "green", shape: "dot", text: node.e4Value !== null ? node.e4Value : RED._("easye4.status.online") });
            }
            if (dev.state === "none") {
                return raw({ fill: "green", shape: "dot", text: node.e4Value !== null ? node.e4Value : RED._("easye4.status.connected") });
            }
            raw({ fill: "grey", shape: "ring", text: RED._("easye4.status.unknown") });
        }
        node.status = function (s) {
            if (s && s.fill === "green") {
                brokerOk = true;
            } else {
                brokerOk = false;
                if (s) brokerStatus = s;
            }
            render();
        };
        node.e4Render = render;
        dev.watchers.add(render);
        node.on("close", function () { dev.watchers.delete(render); });
        dev.broker.register(node);
        render();
        return dev;
    }

    function onClose(node, dev, topics) {
        node.on("close", function (removed, done) {
            topics.forEach((t) => t && dev.broker.unsubscribe(t, node.id, removed));
            dev.broker.deregister(node, done, removed);
        });
    }

    // ---------------------------------------------------------------- Gerät (Konfigurationsknoten)

    function EasyE4DeviceNode(config) {
        RED.nodes.createNode(this, config);
        const dev = this;
        dev.broker = RED.nodes.getNode(config.broker);
        // Aus Sicht der easyE4: "Publish topic" -> wir empfangen, "Subscribe topic" -> wir senden
        // Einfacher Modus ("auto"): aus dem Basis-Topic werden die vier Topics abgeleitet.
        // Ohne topicMode (ältere Flows) oder mit "manual" gelten die einzeln eingetragenen Topics.
        const auto = config.topicMode === "auto";
        const base = (config.baseTopic || "").trim().replace(/\/+$/, "");
        const t = (key, suffix) => (auto ? (base ? base + "/" + suffix : "") : (config[key] || "").trim());
        dev.dataIn = t("dataIn", "data");                  // easyE4 Publish topic
        dev.dataOut = t("dataOut", "set");                 // easyE4 Subscribe topic
        dev.actionOut = t("actionOut", "actions/request"); // easyE4 Actions subscribe topic
        dev.actionIn = t("actionIn", "actions/response");  // easyE4 Actions publish topic
        dev.qos = parseInt(config.qos, 10) === 0 ? 0 : 1; // nur QoS 0/1 unterstützt

        dev.problem = null;
        if (!dev.broker) {
            dev.problem = RED._("easye4.errors.noBroker");
        } else if (auto && !base) {
            dev.problem = RED._("easye4.errors.baseTopicMissing");
        } else {
            for (const [key, t] of Object.entries({
                "Publish topic": dev.dataIn,
                "Subscribe topic": dev.dataOut,
                "Actions subscribe topic": dev.actionOut,
                "Actions publish topic": dev.actionIn,
            })) {
                if (t && !validTopic(t)) {
                    dev.problem = RED._("easye4.errors.invalidTopic", { key });
                    break;
                }
            }
        }

        // ---- Online-Status der easyE4 ----
        // Beim Verbinden meldet die easyE4 {"connected":"true"}. Verliert sie die Verbindung, veröffentlicht der
        // Broker ihre Letzte-Wille-Nachricht {"connected":"false"}. Jede andere Meldung zeigt ebenfalls: online.
        dev.state = dev.dataIn ? "unknown" : "none";
        dev.watchers = new Set();
        dev.setState = function (s) {
            if (dev.state === s) return;
            dev.state = s;
            dev.watchers.forEach((fn) => fn());
        };
        if (dev.problem || !dev.dataIn) return;

        const user = {
            id: dev.id,
            status: function (s) { if (!(s && s.fill === "green")) dev.setState("unknown"); },
            error: function () {},
        };
        dev.broker.register(user);
        dev.broker.subscribe(
            dev.dataIn,
            { qos: dev.qos },
            function (topic, payload) {
                const reported = getReported(tryParse(payload));
                if (!reported) return;
                const c = reported.connected;
                dev.setState(c === "false" || c === false ? "offline" : "online");
            },
            dev.id
        );
        dev.on("close", function (removed, done) {
            dev.broker.unsubscribe(dev.dataIn, dev.id, removed);
            dev.broker.deregister(user, done, removed);
        });
    }
    RED.nodes.registerType("easye4-device", EasyE4DeviceNode);

    // ---------------------------------------------------------------- easyE4 in (Operand lesen)

    function EasyE4InNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        let operand;
        try {
            operand = resolveOperand(config);
        } catch (err) {
            node.status({ fill: "red", shape: "ring", text: err.message });
            node.error(err.message);
            return;
        }
        const dev = attach(node, config, "dataIn", RED._("easye4.errors.missingDataIn"));
        if (!dev) return;

        const want = operand ? normName(operand) : null;
        const onlyChange = config.onlyChange === true || config.onlyChange === "true";
        // Diagnose-Operanden ID1-ID25 sendet die easyE4 ständig; bei "Alle Operanden" nur mit gesetztem Haken ausgeben
        const showDiag = config.showDiag === true || config.showDiag === "true";
        const last = new Map(); // Operand -> zuletzt gesendeter Wert (als JSON)

        dev.broker.subscribe(
            dev.dataIn,
            { qos: dev.qos },
            function (topic, payload, packet) {
                const parsed = tryParse(payload);
                const reported = getReported(parsed);
                const meta = { mqttTopic: topic, qos: packet && packet.qos, retain: packet && packet.retain };

                if (want === null) {
                    // alle Operanden
                    if (!reported) {
                        node.send(Object.assign({ topic, payload: parsed.value }, meta));
                        return;
                    }
                    let out = reported;
                    if (!showDiag) {
                        out = {};
                        for (const k of Object.keys(reported)) if (!/^ID0*\d+$/i.test(k)) out[k] = reported[k];
                        if (Object.keys(out).length === 0) return;
                    }
                    if (onlyChange) {
                        const src = out;
                        out = {};
                        for (const k of Object.keys(src)) {
                            const s = JSON.stringify(src[k]);
                            if (last.get(k) !== s) {
                                last.set(k, s);
                                out[k] = src[k];
                            }
                        }
                        if (Object.keys(out).length === 0) return;
                    }
                    node.send(Object.assign({ topic, payload: out }, meta));
                    return;
                }

                // ein bestimmter Operand
                if (!reported) return;
                const key = Object.keys(reported).find((k) => normName(k) === want);
                if (key === undefined) return;
                const value = reported[key];
                if (onlyChange) {
                    const s = JSON.stringify(value);
                    if (last.get(want) === s) return;
                    last.set(want, s);
                }
                const text = String(typeof value === "object" ? JSON.stringify(value) : value).slice(0, 30);
                if (text !== node.e4Value) {
                    node.e4Value = text;
                    node.e4Render();
                }
                node.send(Object.assign({ topic: key, payload: value }, meta));
            },
            node.id
        );
        onClose(node, dev, [dev.dataIn]);
    }
    RED.nodes.registerType("easye4-in", EasyE4InNode);

    // ---------------------------------------------------------------- easyE4 out (Operand schreiben)

    function EasyE4OutNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        let operand;
        try {
            operand = resolveOperand(config);
            if (operand) checkWritable(operand);
        } catch (err) {
            node.status({ fill: "red", shape: "ring", text: err.message.length > 40 ? err.message.slice(0, 37) + "..." : err.message });
            node.error(err.message);
            return;
        }
        const dev = attach(node, config, "dataOut", RED._("easye4.errors.missingDataOut"));
        if (!dev) return;

        const boolAsNumber = config.boolAsNumber !== false && config.boolAsNumber !== "false";

        node.on("input", function (msg, send, done) {
            done = done || function (err) { if (err) node.error(err, msg); };
            if (!dev.broker.connected) return done(new Error(RED._("easye4.errors.notConnected")));
            if (dev.state === "offline") node.warn(RED._("easye4.errors.deviceOffline"));

            let body;
            try {
                body = buildState(msg, operand, boolAsNumber);
            } catch (err) {
                return done(err);
            }
            const qos = msg.qos === 0 || msg.qos === 1 ? msg.qos : dev.qos;
            const retain = typeof msg.retain === "boolean" ? msg.retain : false;
            dev.broker.publish({ topic: dev.dataOut, payload: JSON.stringify(body), qos, retain }, function (err) {
                done(err);
            });
        });
        onClose(node, dev, []);
    }
    RED.nodes.registerType("easye4-out", EasyE4OutNode);

    // ---------------------------------------------------------------- easyE4 aktion (RUN/STOP, FB, Updates)

    function EasyE4ActionNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const fixed = config.action && config.action !== "msg" ? String(config.action) : null;
        if (fixed && !ACTIONS.has(fixed.toLowerCase())) {
            node.status({ fill: "red", shape: "ring", text: RED._("easye4.status.unknownAction") });
            node.error(RED._("easye4.errors.unknownAction", { action: fixed }));
            return;
        }
        const dev = attach(node, config, "actionOut", RED._("easye4.errors.missingActionOut"));
        if (!dev) return;
        const defaults = { fbtype: (config.fbtype || "WT").trim(), index: config.index };
        const allMessages = config.allMessages === true || config.allMessages === "true";

        // gesendete Anfragen merken, um Antworten zuordnen zu können
        const pending = new Map();

        if (dev.actionIn) {
            dev.broker.subscribe(
                dev.actionIn,
                { qos: dev.qos },
                function (topic, payload, packet) {
                    const parsed = tryParse(payload);
                    const r = parsed.value;
                    const isObj = parsed.ok && isPlainObject(r);
                    const entry = isObj && r.id !== undefined ? pending.get(r.id) : undefined;
                    if (!entry && !allMessages) return; // fremde Antworten / Statusmeldungen
                    // Zwischenmeldung der easyE4 ("IN_PROGRESS"): Die Anfrage ist noch nicht abgeschlossen,
                    // das Ergebnis (SUCCEEDED/FAILED) folgt in einer weiteren Meldung.
                    const inProgress = isObj && String(r.status).toUpperCase() === "IN_PROGRESS";
                    if (inProgress && !allMessages) return;
                    const out = entry ? RED.util.cloneMessage(entry.msg) : {};
                    Object.assign(out, { topic, payload: r, qos: packet && packet.qos, retain: packet && packet.retain });
                    if (isObj) {
                        out.id = r.id;
                        out.operation = r.operation || (entry && entry.op);
                        out.status = r.status;
                        out.inProgress = inProgress;
                        out.success = inProgress ? undefined : r.status === "SUCCEEDED";
                        if (r.response !== undefined) out.response = r.response;
                        if (isPlainObject(r.statusDetails) && r.statusDetails.errorMsg !== undefined) {
                            out.errorMsg = r.statusDetails.errorMsg;
                        }
                        if (entry && !inProgress) pending.delete(r.id);
                    }
                    node.send(out);
                },
                node.id
            );
        }

        node.on("input", function (msg, send, done) {
            done = done || function (err) { if (err) node.error(err, msg); };
            if (!dev.broker.connected) return done(new Error(RED._("easye4.errors.notConnected")));
            if (dev.state === "offline") node.warn(RED._("easye4.errors.deviceOffline"));

            let body;
            let op;
            try {
                const key = fixed || (msg.action !== undefined && msg.action !== null && msg.action !== "" ? String(msg.action) : null);
                if (!key) throw new Error(RED._("easye4.errors.noAction", { list: ACTION_NAMES }));
                op = ACTIONS.get(key.toLowerCase());
                if (!op) throw new Error(RED._("easye4.errors.unknownActionAllowed", { action: key, list: ACTION_NAMES }));
                const id = msg.id !== undefined && msg.id !== "" ? String(msg.id) : newActionId();
                body = buildAction(op, msg.payload, defaults, id);
            } catch (err) {
                return done(err);
            }

            pending.set(body.id, { op, msg: RED.util.cloneMessage(msg) });
            if (pending.size > 200) pending.delete(pending.keys().next().value);

            const qos = msg.qos === 0 || msg.qos === 1 ? msg.qos : dev.qos;
            // Befehle nie retained, sonst würden sie beim Wiederverbinden erneut ausgeführt
            dev.broker.publish({ topic: dev.actionOut, payload: JSON.stringify(body), qos, retain: false }, function (err) {
                if (err) pending.delete(body.id);
                done(err);
            });
        });
        onClose(node, dev, [dev.actionIn]);
    }
    RED.nodes.registerType("easye4-action", EasyE4ActionNode);
};
