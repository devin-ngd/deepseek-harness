/** Native denies network/file/permission/navigation capabilities before the verified scoped document runs. */
import { NativeProductRichOwner } from './NativeProductRichOwner'
import { NativeProductOwner } from './NativeProductOwner'
import { productConfiguration } from './ProductConfiguration'
@Component
export struct ProductRichSurface {
  owner: NativeProductRichOwner = new NativeProductRichOwner(new NativeProductOwner(productConfiguration), productConfiguration.corePolicyJson)
  aboutToDisappear(): void { void this.owner.close() }
  build() {
    Web({ src: '', controller: this.owner.controller }).javaScriptAccess(true).fileAccess(false).domStorageAccess(false).databaseAccess(false).onlineImageAccess(false).geolocationAccess(false).multiWindowAccess(false).mixedMode(MixedMode.None)
      .onControllerAttached(() => this.owner.attached()).onPageEnd((event: OnPageEndEvent) => this.owner.bind(event.url)).onPageBegin((event: OnPageBeginEvent) => this.owner.navigation(event.url))
      .onLoadIntercept((event: OnLoadInterceptEvent) => !this.owner.allow(event.data.getRequestUrl(), event.data.isMainFrame())).onOverrideUrlLoading((request: WebResourceRequest) => !this.owner.allow(request.getRequestUrl(), request.isMainFrame()))
      .onPermissionRequest((event: OnPermissionRequestEvent) => event.request.deny()).onScreenCaptureRequest((event: OnScreenCaptureRequestEvent) => event.handler.deny()).onShowFileSelector((event: OnShowFileSelectorEvent) => { event.result.handleFileList([]); return true }).onWindowNew((event: OnWindowNewEvent) => event.handler.setWebController(null)).onDownloadStart(() => {}).onRenderExited(() => { void this.owner.close() })
      .width('100%').height(240)
  }
}
