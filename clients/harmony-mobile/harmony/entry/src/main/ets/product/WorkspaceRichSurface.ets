/** Dedicated native rich Web: network, files, storage, permissions and external navigation stay disabled. */
import { NativeWorkspaceRichGuest } from './NativeWorkspaceRichGuest'
@Component
export struct WorkspaceRichSurface {
  owner: NativeWorkspaceRichGuest | undefined = undefined
  aboutToDisappear(): void { this.owner?.retire() }
  build() {
    if (this.owner !== undefined) {
      Web({ src: '', controller: this.owner.controller, sharedRenderProcessToken: this.owner.renderToken }).javaScriptAccess(true).blockNetwork(true).fileAccess(false).domStorageAccess(false).databaseAccess(false)
        .onlineImageAccess(false).geolocationAccess(false).multiWindowAccess(false).mixedMode(MixedMode.None)
        .onControllerAttached(() => { try { this.owner?.attached() } catch (error) { void error; this.owner?.retire() } })
        .onPageEnd((event: OnPageEndEvent) => { try { this.owner?.bind(event.url) } catch (error) { void error; this.owner?.retire() } }).onPageBegin((event: OnPageBeginEvent) => this.owner?.navigation(event.url))
        .onLoadIntercept((event: OnLoadInterceptEvent) => this.owner === undefined || !this.owner.allow(event.data.getRequestUrl(), event.data.isMainFrame()))
        .onOverrideUrlLoading((request: WebResourceRequest) => this.owner === undefined || !this.owner.allow(request.getRequestUrl(), request.isMainFrame()))
        .onPermissionRequest((event: OnPermissionRequestEvent) => event.request.deny()).onScreenCaptureRequest((event: OnScreenCaptureRequestEvent) => event.handler.deny())
        .onShowFileSelector((event: OnShowFileSelectorEvent) => { event.result.handleFileList([]); return true }).onWindowNew((event: OnWindowNewEvent) => event.handler.setWebController(null))
        .onRenderExited(() => this.owner?.exited()).width('100%').height('100%')
    }
  }
}
