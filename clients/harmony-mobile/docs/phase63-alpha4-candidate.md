# alpha.4 适配与 unsigned 候选

泛型诊断已在独立源码工作区修复；历史投影由当前 alpha.4 Host 实现抽出，Host 与浏览器共用验证逻辑，没有复制旧 v15 产物。主仓未应用该补丁，安装中的 desktop 和 rich-inline 未改动。源码基线为 b23972eb7145ab0bb923c45dc28ffcd9f6556412，后续主仓 UI 提交没有改变 core/api/typert/rich-inline 接口。

实际验证：100 项源码回归、82 项核心/guest/profile 回归、151 模块严格检查、Host/Client 聚合 2 项均通过；新子路径的 Node 导入与浏览器 bundle smoke、本次两包的客户端独立打包及官方导出文档定向检查通过，双语配对一致。持久化 67 根类型匹配，结构变化为 0；生成目录只更新声明位置等元数据。

整仓 Client bundle 仍有 rolldown Missing field code 错误，Web build 因此跳过；两个修改包单独打包通过不能证明全仓并发构建已经通过。全库导出文档扫描的输入在修订后失效，已停止，不计为通过；同一官方规则对两个修改包的完整源码定向检查通过。

候选：D:/Temp/dsh-harmony-mobile-20261016-alpha4-unsigned.hap，5268759 字节，SHA-256 e44ef67753412e0486c37d994c451d10fddf224c1e4c22a07defb595ebcd3858。官方 DevEco 26.0.0.851 / SDK 26.0.0.105 API26 完成 ArkTS 编译与 HAP 打包；它是 unsigned，未签名、未安装、未真机运行。

包名 local.dsh.mobile.offlineproduct，版本 0.0.0/1，权限仍只有 INTERNET，新增权限为 0。与上次 unsigned 包相比仅富块文档脚本、ArkTS 字节码及 source map 三项变化；原 HUKS ArkTS 输入逐文件核验一致，没有读取或创建真实密钥，没有创建真实 grant 或激活 relay。构建与离线测试不能替代真机 ArkWeb/HUKS/TLS 或真实桌面执行闭环。

本候选需要新的签名/原位安装批准，旧候选批准不覆盖此哈希。后续必须使用原签名材料及同 bundle 原位安装，不得卸载、清数据、重建 HUKS/DPAPI 身份或增加权限；新访问授权另按原有单个隔离 replay Session、实际创建起最多 30 分钟、不自动续期规则办理，旧回应不能重放。

源码补丁、完整结果及回退位置见 [phase63-summary.json](../evidence/phase63-summary.json)、[phase63-upstream.patch](../evidence/phase63-upstream.patch) 和 [HAP 内容核对](../evidence/phase63-hap-audit.json)。已安装应用未变，原 signed HAP 和全部旧证据保留。源码 worktree/候选属于本地开发成果，没有 commit、push、上架或收费。
