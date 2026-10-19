---
kind: reference
description: normal-controls批准部署的安装、原身份保留、准备验证和未开启的验收窗口
---

# normal-controls部署状态

已按2026-10-18 04:08:20 UTC用户要求停止开发和部署，转入[开发者交接](HANDOFF-2026-10-18.md)。手机和桌面插件包已安装，bundle未启用，临时补丁未应用，测试授权从未开始。没有授权起止时间、pair上传、relay改动或本任务真实模型调用。[最终核验](../evidence/normal-controls-handoff-state.json)优先于本页停止前的方案。

本轮依据2026-10-18 03:39:00 UTC的“允许”（Sentinel_e2d971bb3abc8191b9b8f261d185e4fb），对应02:47:22 UTC提案Sentinel_e59e13d2b694819184894d333e98f09c：安装并启用当前桌面插件、原证书保留数据升级、一个普通合成Session、最多3次固定响应、原HUKS/DPAPI身份、一个最多30分钟的新范围、仅六个公开pair字段上传至指定dhome目录，以及既定relay/service/burst临时调整和撤销恢复。实际操作仍经过原生比较和授权控件；任何目标或权限扩大均不由这次批准推导。

## 已完成

| 层级 | 实际证据 | 结果 |
| --- | --- | --- |
| 官方签名 | [签名及载荷校验](../evidence/normal-controls-signed-build.json) | 原证书链SHA256保持83cccc2f…46bd9；23个应用条目完全相同，仅新增SDK独立再生成的.pages.info；签名执行一次。 |
| 原手机安装 | [HDC安装结果](../evidence/normal-controls-installation.json) | 03:48:05.420 UTC成功；原bundle、版本0.0.0/code1、仅INTERNET，install -r，无卸载或数据清除。 |
| 原生界面和HUKS | [真机截图](../evidence/normal-controls-phone-identity.jpeg) | 新范围管理入口出现，未配对、未连接；原harmony-phase54-phone公开指纹与既有6dbd072d…fe9b99完全匹配，没有创建身份。 |
| 实际安装版服务 | [独立隔离测试](../evidence/normal-controls-isolation.json) | alpha.4的92个公开模块；合成文件provider和authorization注册表隔离，根provider继续保留；无真实凭据文件、模型或网络。 |
| 当前桌面安装 | [安装观察](../evidence/normal-controls-desktop-install-observation.json)、[最终核验](../evidence/normal-controls-handoff-state.json) | 正常Plugin Manager更新包成功，70个公开文件与冻结包匹配；bundle仍未选入，临时补丁未写入。 |

签名包为D:/Temp/dsh-harmony-mobile-normal-controls-signed.hap，SHA256为b756d287608438d72439f6475a01e8a90a7a27c62e6e7fff121dae2e378d6607。手机安装来自该包；桌面已更新为[已验证产物](../evidence/normal-controls-artifacts.json)中3a2212f0…2892的normal-controls.1。交接审计确认该HAP的实际编译配置仍是默认禁用连接，不能当成已就绪的真实传输客户端，详见交接文档。

原DPAPI文件未改动，SHA256保持dc8c1922…3dfe2；仅读取公开身份字段和撤销元数据，没有解除保护或更换alias。旧harmony-mobile-replay范围仍为epoch10、revoked=true；同一桌面/设备ID在desktop profile下的独立记录不存在。预览使用Cordis组隔离credentials和authorization，在同一个实际Host继承其余服务，指向原凭据文件并关闭该provider的watch；不会复制身份或创建第二个运行时。

## 当前阻塞

正常Plugin Manager最终在04:06:19 UTC接收一次安装请求，安装结果已用文件和manifest复核；“立即启用”在控件检查阶段拒绝。此前UIAutomation导航和输入值读回有异步延迟，Invoke返回不能当成已完成。用户随后要求停止，因此没有继续启用、应用临时组或创建测试Session。当前停止要求和默认禁用的HAP连接配置，是后续不能直接开始现场链路的原因。

04:00 UTC前的只读检查确认dhome原server、config.enabled.json、nginx和phase69-successor代码哈希与原记录一致，服务active，ProtectSystem=strict、ProtectHome=read-only；新normal-product-acceptance目录和80-normal-product-acceptance.conf均不存在。没有上传公开pair、切换服务或调整nginx。

## 续接与回退

以下为停止前的未完成方案记录，不授权执行；实际后续以[交接计划](HANDOFF-2026-10-18.md)和用户新的明确指示为准。初始补丁预览的基底已过时，不能覆盖当前并行修改过的默认模型配置。

1. 窗口可用后，通过当前安装版Plugin Manager安装唯一tgz，核对版本及仅目标依赖变化；启用其bundle，再以预览补丁配置/test-session和原provider组。写入前重验五个profile文件和原凭据哈希，保留无关设置。
2. 完成relay准备并再次确认原手机在线；新建专用普通Session，用/harmony-test new和两条status命令核对profile=desktop、合成Session、固定三响应与零消耗。该Session创建时会启动自己的30分钟响应期限，准备未完成时不要提前创建。
3. 从该Session执行原生配对流程。确认新grant时才记录UTC起止，并只上传提案中六个公开字段到指定路径；不得复用旧epoch10范围。准备好手机和relay后才connect。
4. 按[首次验收清单](first-device-acceptance.md)核对控制/数据认证、手机任务、流式消息、ArkWeb表单、正确Session、幂等和重连。任一步失败立即停止依赖步骤，撤销新范围并恢复本轮拥有的服务/配置改动。未知安装或派发结果只检查，不自动重复。
5. HDC离线时仅每30秒观察一次，连续5次失败停止；不重试有副作用的动作，不重启HDC或更改安全设置。

回退保留原Session、HUKS身份、公共撤销历史和原签名包；只恢复本轮拥有的配置，不覆盖并行用户设置或新撤销记录。当前实际变更是手机保留数据升级和桌面插件包更新，bundle未启用，尚无新grant或relay改动需要撤销。真机证据只覆盖升级、界面和原公钥读取，不能证明桌面执行、传输认证或ArkWeb交互闭环。
