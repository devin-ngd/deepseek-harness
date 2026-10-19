/** Fixed HAP-local HTML/CSS preview. Scripts stay disabled pending target ArkWeb qualification. */
import { webview } from '@kit.ArkWeb'

@Component
export struct RichPreview {
  private controller: webview.WebviewController = new webview.WebviewController()

  build() {
    Web({ src: $rawfile('phase5-rich-preview.html'), controller: this.controller })
      .javaScriptAccess(false)
      .domStorageAccess(false)
      .fileAccess(false)
      .onlineImageAccess(false)
      .width('100%')
      .height(420)
  }
}
