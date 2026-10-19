# 真机编码失败与原生JavaScript模块绑定修复

本轮获批的解析诊断版已签名、官方验签并原位安装，原HUKS/DPAPI身份复用成功。实际挑战和固定 `{}` 均通过原生JSON解析并进入共享实现，但在UTF-8字节计数处抛出SyntaxError，尚未执行共享JSON/schema校验。已确认编译后的JavaScript使用错误的SDK模块绑定，针对性修复及编译产物检查均完成；修复版尚未签名、安装，不能声明真机预览故障消除。真实现场始终为grant0，手机和隔离桌面已退出，中继配对未启用。

## 已安装的批准候选

[批准记录](../evidence/phase57-authorization.json)对应用户2026-10-15 09:17 UTC的“允许”，范围是上一轮封存解析诊断候选。源码ZIP、unsigned HAP、前代已安装HAP、62项公开工程输入和原Profile均核验。原独立签名工程只更新NativeProductOwner和ProductCore；原配置/材料不变，官方verify-app与verify-profile均返回0，提取Profile与原材料逐字节相同。[签名结果](../evidence/phase57-signed-build.json)和[原位安装结果](../evidence/phase57-installation.json)保留成功证据。

安装文件 `D:/Temp/dsh-harmony-mobile-20261015-enrollment-parser-signed.hap` 为5327475字节，SHA256 `e6da008fde4d3cc6ff84f652df56d6b323037eedd088319288d4b4175b289193`。原CMM-AL10/API26上的bundle仍为 `local.dsh.mobile.offlineproduct` v0.0.0/code1，仅INTERNET；没有卸载、清数据、增加权限或重建身份。签名构建约两分钟后正常完成，没有未知安装结果或待执行命令。

## 真实拒绝的位置

本应用PID41004先对固定 `{}` 复验：原生TextArea读回确认字节一致，记录parse-offer、native-parse-json、shared-offer-input、shared-input-entered，随后在shared-offer-input记录SyntaxError。没有shared-parse-json、共享返回元数据、公钥重读或验签阶段。对原生JSON解析的指责已被此次记录排除。

随后通过原生控件重读已有手机公钥，其摘要与保留公开身份一致；原电脑身份通过REOPEN/OPEN复用。[运行时核验](../evidence/phase57-runtime-preflight.json)确认封存`.4`和工具字节未变。桌面新挑战有效期至09:39:52.536Z，原生框中1323字节输入与原文件逐字段相同，SHA256 `a7fe541e8c87accdbc7ecd0bb85676b0850161c251a74a75cb71276760a7b7f1`。09:31 UTC预览重复相同阶段序列和SyntaxError，未签署挑战。公开挑战和原始布局均不进入源交付。

共享实现的shared-input-entered之后立即调用parseFirstUseOffer；该函数在首次阶段回调之前只执行 `new TextEncoder().encode(raw).length` 容量检查。两字节 `{}` 不会触发容量超限，超限也不是SyntaxError。故实际抛错已定位在共享原生UTF-8适配器调用，尚未到共享JSON/schema、转录构造或密码验签。[现场摘要](../evidence/phase57-native-refusal.json)保留各项资格，未把诊断阶段变化称为修复完成。

## 确认的编译缺陷与修复范围

[构建产物证据](../evidence/phase57-sdk-import-defect.json)显示，相同SDK下JavaScript的 `import { util } from '@kit.ArkTS'` 保留成 `import { util } from '@ohos:ArkTS'`，而本应用原生ArkTS被正确转换为 `import util from '@ohos:util'`。本机官方kit_configs将util明确映射为 `@ohos.util.d.ts` 的default导出；不存在对应的 `@ohos.ArkTS.d.ts` 系统API。原SDK替身直接替换Kit，因而没有覆盖这一实际编译后的错误绑定。

共享 [native-protocol-shims](../src/native-protocol-shims.mjs)改为直接默认导入 `@ohos.util`，使用显式UTF-8，并在空串时返回空Uint8Array，保持共享协议的字节接口；官方SDK声明native encodeInto空串可能返回undefined。[官方util文档](https://raw.githubusercontent.com/openharmony/docs/master/en/application-dev/reference/apis-arkts/js-apis-util.md)及本机API26声明是API核对来源。ProductCore与PairedCore都从同一个适配器重新生成，避免只修复首用而留下传输中的相同绑定。Web富文档、guest SDK、bridge权限、密钥/授权、数据字段、持久格式和人工确认均未改变。

[新增检查](../scripts/native-js-imports.mjs)已接入实际执行的build-native：读取官方编译filesInfo及缓存JavaScript，要求所需核心均存在，并仅接受default `@ohos:util`，拒绝残留Kit、错误命名导出、缺失模块或意外外部依赖。旧已编译候选作为无效样本确实被拒绝；新官方编译的ProductCore和PairedCore都通过。编译成功与模块检查分别记录，检查失败不会交付HAP。两个旧阶段生成脚本保留为历史复现工具，不写回它们的证据；当前维护入口build-product-core及SDK替身已更新。

修复效果仍需真机新版本验证。现有手机日志没有提供可归因的底层模块加载消息，未将缺失的日志补成观察事实。当前证据是实际编码调用失败与已确认的编译绑定缺陷；不能保证修复后没有其他平台互操作问题。

## 验证与候选

[22项单元/SDK替身测试](../evidence/phase57-util-tests.json)通过，覆盖UTF-8/Unicode、空输入、fatal解码拒绝、当前预览拒绝路径、受限采集器和真实旧编译产物的错误导入。[9项新旧对比](../evidence/phase57-util-parity.json)确认规范输出和拒绝类别一致。[9项固定replay合成回归](../evidence/phase57-interaction-vitest.json)通过，包含原生owner替身到隔离DSH、共享加密传输、原始Chrome富表单点击、幂等恢复、取消及撤销；这不是ArkWeb或真实手机到桌面证据。首次运行有一项仍断言旧通用错误文案，失败证据保留；将篡改证明、过期输入的预期更新为现有准确阶段后重跑通过，拒绝行为未放宽。

[官方API26 unsigned构建](../evidence/phase57-util-native-build.json)及两个实际编译模块的导入检查通过；SDK能力/异常处理警告保留。[4项构建参数拒绝](../evidence/phase57-build-variants.json)确认未知或多选variant在写入前拒绝。[公开源码比较](../evidence/phase57-util-source-comparison.json)确认相对已安装工程，HAP仅ProductCore.js与PairedCore.js改变。

新文件 `D:/Temp/dsh-harmony-mobile-20261015-native-util-binding-unsigned.hap` 为5268782字节，SHA256 `d6464377518b9bc1afc2f366ec825e35ce68845491cbc0a8a7c06a93fef8cde2`。尚未签名、安装或执行。源码、前像、首次失败和最终通过证据见[交付清单](../evidence/phase57-deliverables.json)。未运行真实模型、用户项目任务、全仓测试或上游升级，未commit/push。

## 现场与下一批准

field在READ PHONE PROOF处收到STOP并以拒绝状态退出，[精确进程检查](../evidence/phase57-owned-processes.json)为0。手机通过“断开并退出”正常退出，[最终设备状态](../evidence/phase57-device-final.json)确认PID为空。原HUKS/DPAPI身份、home/world及历史证据保留；没有phone-reply或公开信任初始化。[授权检查](../evidence/phase57-desktop-identity.json)为grant0，[中继检查](../evidence/phase57-relay-unchanged.json)确认原配置/程序、空信任目录及无服务覆盖。grant从未起算，没有续期或撤销成功的声明。真实规范Session没有用户消息或模型请求，不能把记录fixture算作实际任务执行。

用户09:17批准覆盖已完成的解析诊断版；此功能修复是另一个新安装候选，依用户要求先报告必要性、修改与风险并取得对应批准。拟操作为复用原签名材料，对这个仅改变两个共享JavaScript模块的HAP签名并原位更新同bundle，不卸载、清数据、加权限或重建身份；然后复用原world与两端身份，用新鲜挑战验证编码、预览和验签。风险是两个共享模块的实际SDK加载及空串处理行为改变；离线与产物检查已覆盖，真实设备仍待确认。一次grant仍限原测试Session、最长30分钟且不自动续期，通过后才继续真实手机任务、流式、ArkWeb富交互、去重恢复、取消与失效验证。
