# Offline handoff package

English | [中文](README.zh.md)

Only an existing Node 22.19+ or 24+ is needed; the original repository, node_modules, DevEco and HDC are unnecessary. After extraction, run `node verify.mjs`. It reads only bundled fixtures and checks file hashes, synthetic reset reads through the current shared TS, and the original criteria against v28's recorded native logs/control tree; it does not rerun native execution or establish acceptance of the latest complete product. This batch ran Node 24.13.0; the other declared engine versions were not measured in this batch.

It reads no installed configuration, real Sessions or credentials, opens no listener, dispatches no task, invokes no model, and performs no installation or signing. This package cannot connect to a real desktop and contains no HAP installer. Next-stage plans and the version ledger are generated under reference/; source references remain text and do not assume that the standalone package includes the original repository. Required installation/access/pairing/signing/network approvals remain separate.
