/** Add locale-owned native first-use messages; no account, permission or connectivity action. */
import { readFile, writeFile } from 'node:fs/promises'
const path='harmony/entry/src/main/resources/base/element/string.json',value=JSON.parse(await readFile(path,'utf8'))
const messages={product_enrollment_deadline:'挑战截至 %1$s；申请授权 %2$d 分钟',product_enrollment_notice:'将电脑生成的公开挑战粘贴到这里。先核验桌面签名并比较双方指纹及限定会话；确认后仅签署这次挑战。',product_enrollment_offer:'桌面公开挑战 JSON',product_enrollment_preview:'核验挑战与指纹',product_enrollment_sign:'确认并签署这次挑战',product_restore_saved:'读取已保存的公开配对配置',product_network_notice:'本次连接只使用下面的公开主机。请另行确认允许联网；保存配对后仍需点击连接。',product_network_allow:'允许本次使用这个主机',product_disabled:'远程连接尚未启用。可先生成本机身份，或读取已保存配置并重新确认主机。'}
for(const[name,text]of Object.entries(messages)){const old=value.string.find(row=>row.name===name);if(old)old.value=text;else value.string.push({name,value:text})}await writeFile(path,JSON.stringify(value,null,2)+'\n')
