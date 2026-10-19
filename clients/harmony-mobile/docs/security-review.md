# 当前安全准入

本页是客户端实验 reference。默认ArkTS provider和共享TS `DisabledNativeProvider` 都没有启用接口；共享网络配置只允许explicit临时loopback replay。`configured-https` 为保留字段，解析时立即返回 `live-provider-unavailable`，从构造到fetch之间没有可用的真实连接路径。MockDeviceRegistry仅接受mock构造且只存内存合成grant，不是配对、设备证明或生产认证。最终bundle gate检查不含mock身份/宿主与网络实现。

设备安全测试通过现有grant所有者检查未配对、撤销、grant到期、device/desktop/epoch/session/operation超scope；这些拒绝发生在相应service访问或local review之前。真实credentials、长期授权、relay/TLS/E2EE仍没有实现或激活。本轮没有生成密钥或持久访问记录；未来标准crypto接口与SDK工作见 [平台适配](native-platform.md)。

`NativeApprovalReview` 是无IO的本地审批预检，不是执行许可。它保存唯一当前review，验证exact JSON字段、bytes、设备scope、Session/action、epoch、revision与expiry；同revision改内容拒绝，旧revision和过期拒绝。确认需要actual native receiver对象、当前native选择及再次grant检查；JSON中的nativeConfirmed/source、克隆对象或富packet都不能替代真实receiver。确认仅返回 `local-review-only`，没有token、签名、desktop approval或任务派发；同review反复点击不产生新的本地决定，冲突决定拒绝。

现有canonical approval.list只有旧display字段，没有完整Session/action binding，因此继续只展示，不能送入新预检并被确认。NativeApprovalReview不导出到guest，也未作为production server endpoint。未来必须由真实审批service提供当前binding及明确confirmation endpoint，native审查完成后提交同一binding并由桌面再验证revision/expiry/设备授权；响应丢失按该service的幂等状态查询，不能从本地review推断电脑已批准。

维护中的RelayGuestGate继续只允许rich ready、draft、invoke、status等既有method；正确mount/revision/seq的 `approval.confirm` 仍在native request前拒绝。Chrome伪审批测试以及纯状态actualSource测试不是ArkWeb隔离证据；真正ArkWeb port来源、导航、CSP和生命周期需SDK与真机另验。
