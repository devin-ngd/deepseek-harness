# 第七批实验客户端行为变更

这是尚未发布的客户端目录变更，不涉及DSH产品API、Session committed generations或SQLite schema。此前 `NetworkPhone` 允许显式configured-https经过URL校验；现在该配置在构造/resolve时硬拒绝 `live-provider-unavailable`，避免fixture identity进入真实网络。调用方必须保持disabled或在隔离测试中使用loopback-fixed-replay；若未来需要live，需独立authenticated provider、相应审查与用户批准，不能把mode改名绕过。

原有loopback、canonical rich SDK、request/frame/cache版本未变；完整旧用例仍保留。新的NativeApprovalReview仅做local-review-only，不扩展MobileOperation，不添加approval response endpoint，不把旧approval.list变成可审批接口。双方SDKexpected outputs无需变化，因为agent-loop/session events未改。
