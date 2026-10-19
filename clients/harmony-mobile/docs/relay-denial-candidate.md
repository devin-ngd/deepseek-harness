# HTTP upgrade 拒绝修复候选

当前服务器仍运行已批准的 phase40.1，实际TLS/空房间证据见[部署记录](relay-deployment-20261014.md)。本次没有服务器连接、上传、服务替换或新身份。

候选为 `harmony-light-relay-0.0.0-phase40.2.zip`，103873字节，32个逐entry验证的文件，SHA256 `200cb6ff842042589bcc5222ff3a83fb40234f16d0877b037fd1f88fd258e563`。它将所有upgrade准入失败统一返回空403、Connection close、Content-Length0和Cache-Control no-store，再在写入完成后destroy；同步IO失败仍直接destroy。响应不包含请求字段、拒绝原因、身份、capability或房间状态。

合法握手、双方证明、一次性capability、opaque转发、revocation/expiry、配置和资源限额不变。TCP容量和HTTP解析失败仍可直接丢弃；维护中的ws对准入后的握手语法错误可返回400，因此不能声称所有502均已消失。

47项源回归、6项候选built ESM回归及142模块严格类型检查通过；包括8种data拒绝、8种control拒绝、半开连接在单连接上限下的清理、写失败销毁、代理透传403及合法101，以及既有双端转发/证明/重连/撤销。固定[owner-local快照](../tests/fixtures/relay-upgrade-denial.expected.json)核对所有拒绝响应相同且不回显。代理测试是Node模拟，本机无nginx，未把它称为真实nginx或Linux候选验收。

建议在单独批准此hash后同场更新：当前broker仍关闭，普通拒绝的502会误导连接诊断；修复小且不扩授权。实际更新应仅替换获批包代码/版本资料，保留config.enabled.json、公共状态、证书和nginx/unit，显式stop/start新relay并验证外部两路径403、默认拒绝及清理；不得据此启broker或配对。当前部署的旧包仍完整保留，可回退同一服务。

[封存与源变更前像](../evidence/relay-denial-final-seal.json)、[升级说明](upgrade-guide/v0.0.0-phase40.1/relay-upgrade-refusal/guide.md)、[源回归](../evidence/relay-denial-vitest.json)、[发布路径回归](../evidence/relay-denial-packed-tests.log)。双语指南使用维护中的逐section配对工具；root CLI将clients排除在文档corpus之外，未为此扩大corpus或修改主仓文档。
