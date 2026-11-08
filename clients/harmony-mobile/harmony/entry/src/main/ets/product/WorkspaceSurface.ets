/** Trusted standard frontend surface; generated rich documents keep their separate restricted owner. */
import { NativeWorkspaceOwner } from './NativeWorkspaceOwner'
import { NativeProductOwner } from './NativeProductOwner'
import { productConfiguration } from './ProductConfiguration'
@Component
export struct WorkspaceSurface {
  owner: NativeWorkspaceOwner = new NativeWorkspaceOwner(new NativeProductOwner(productConfiguration), productConfiguration.corePolicyJson)
  generation: number = 0
  aboutToDisappear(): void { this.owner.retire(this.generation) }
  build() {
    Web({ src: '', controller: this.owner.controller, sharedRenderProcessToken: this.owner.renderToken() }).javaScriptAccess(true).javaScriptOnDocumentStart(this.owner.scripts(this.generation))
      .fileAccess(false).domStorageAccess(true).databaseAccess(false).onlineImageAccess(true).geolocationAccess(false).multiWindowAccess(false).mixedMode(MixedMode.None)
      .onControllerAttached(() => this.owner.attached(this.generation)).onPageEnd((event: OnPageEndEvent) => this.owner.bind(event.url, this.generation)).onPageBegin((event: OnPageBeginEvent) => this.owner.navigation(event.url, this.generation))
      .onInterceptRequest((event: OnInterceptRequestEvent) => this.owner.intercept(event.request, this.generation))
      .onLoadIntercept((event: OnLoadInterceptEvent) => !this.owner.allow(event.data.getRequestUrl(), event.data.isMainFrame(), this.generation))
      .onOverrideUrlLoading((request: WebResourceRequest) => !this.owner.allow(request.getRequestUrl(), request.isMainFrame(), this.generation))
      .onConsole((event: OnConsoleEvent) => {
        const message = event.message.getMessage()
        if (/(?:Error|error|failed|rich-inline)/.test(message)) console.info('DSH_WORKSPACE_CONSOLE ' + message.replace(/([?&]token=)[^&\s]+/g, '$1[redacted]').slice(0, 1000))
        return false
      })
      .onPermissionRequest((event: OnPermissionRequestEvent) => event.request.deny()).onScreenCaptureRequest((event: OnScreenCaptureRequestEvent) => event.handler.deny())
      .onShowFileSelector((event: OnShowFileSelectorEvent) => { event.result.handleFileList([]); return true }).onWindowNew((event: OnWindowNewEvent) => event.handler.setWebController(null))
      .onRenderExited(() => this.owner.exited(this.generation)).width('100%').height('100%')
  }
}
