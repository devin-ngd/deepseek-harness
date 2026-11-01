/** Transcript entry: user text stays literal; assistant text renders the Markdown subset with selectable text and copyable code blocks. */
import { pasteboard } from '@kit.BasicServicesKit'
import { MdBlock, MdSpan, parseMarkdown } from './MarkdownModel'

@Component
export struct MessageView {
  @Prop role: string = 'assistant'
  @Prop @Watch('parse') text: string = ''
  @Prop live: boolean = false
  @State private blocks: MdBlock[] = []
  @State private version: number = 0
  aboutToAppear(): void { this.parse() }
  parse(): void { this.blocks = this.role === 'user' ? [] : parseMarkdown(this.text); this.version++ }
  private copy(value: string): void {
    const data = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, value)
    pasteboard.getSystemPasteboard().setData(data).then(() => { this.getUIContext().getPromptAction().showToast({ message: $r('app.string.copied'), duration: 1500 }) }).catch((error: Error) => { void error })
  }
  @Builder inline(block: MdBlock, size: number, strong: boolean) {
    if (block.plain) {
      Text(block.text).fontSize(size).lineHeight(size + 8).fontColor($r('app.color.text_primary')).fontWeight(strong ? FontWeight.Bold : FontWeight.Normal).copyOption(CopyOptions.InApp).width('100%')
    } else {
      Text() {
        ForEach(block.spans, (span: MdSpan) => {
          if (span.code) {
            Span(span.text).fontFamily('monospace').fontSize(size - 1).fontColor($r('app.color.inline_code')).textBackgroundStyle({ color: $r('app.color.code_background'), radius: 4 })
          } else {
            Span(span.text).fontWeight(span.bold || strong ? FontWeight.Bold : FontWeight.Normal)
          }
        }, (span: MdSpan, index: number) => this.version + ':' + index)
      }.fontSize(size).lineHeight(size + 8).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.InApp).width('100%')
    }
  }
  @Builder blockView(block: MdBlock) {
    if (block.kind === 'code' || block.kind === 'table') {
      Column({ space: 6 }) {
        if (block.kind === 'code') {
          Row() {
            Text(block.marker).fontSize(11).fontColor($r('app.color.text_tertiary')).layoutWeight(1)
            Button({ type: ButtonType.Normal, stateEffect: true }) {
              Row({ space: 4 }) {
                SymbolGlyph($r('sys.symbol.doc_filled_on_doc')).fontSize(13).fontColor([$r('app.color.text_secondary')])
                Text($r('app.string.copy_code')).fontSize(11).fontColor($r('app.color.text_secondary'))
              }
            }.height(26).padding({ left: 8, right: 8 }).borderRadius(6).backgroundColor($r('app.color.surface_high')).accessibilityText($r('app.string.copy_code')).onClick(() => this.copy(block.text))
          }.width('100%')
        }
        Text(block.text).fontSize(13).lineHeight(20).fontFamily('monospace').fontColor($r('app.color.code_text')).wordBreak(WordBreak.BREAK_ALL).copyOption(CopyOptions.InApp).width('100%')
      }.width('100%').padding(10).backgroundColor($r('app.color.code_background')).borderRadius(10).border({ width: 1, color: $r('app.color.border') })
    } else if (block.kind === 'heading') {
      this.inline(block, block.level <= 1 ? 19 : block.level === 2 ? 17 : 16, true)
    } else if (block.kind === 'bullet' || block.kind === 'ordered') {
      Row({ space: 8 }) {
        if (block.kind === 'bullet') {
          Row().width(5).height(5).borderRadius(2.5).backgroundColor($r('app.color.text_secondary')).margin({ top: 9 })
        } else {
          Text(block.marker).fontSize(15).lineHeight(23).fontColor($r('app.color.text_secondary'))
        }
        Column() { this.inline(block, 15, false) }.layoutWeight(1)
      }.width('100%').alignItems(VerticalAlign.Top).padding({ left: block.level * 16 + 2 })
    } else if (block.kind === 'quote') {
      Column() { this.inline(block, 15, false) }.width('100%').padding({ left: 12 }).border({ width: { left: 3 }, color: { left: $r('app.color.border') } })
    } else if (block.kind === 'rule') {
      Divider().color($r('app.color.border')).strokeWidth(1)
    } else {
      this.inline(block, 15, false)
    }
  }
  build() {
    if (this.role === 'user') {
      Row() {
        Text(this.text).fontSize(15).lineHeight(23).fontColor($r('app.color.text_primary')).copyOption(CopyOptions.InApp)
          .padding({ left: 14, right: 14, top: 10, bottom: 10 }).backgroundColor($r('app.color.user_bubble')).borderRadius(18).constraintSize({ maxWidth: '86%' })
      }.width('100%').justifyContent(FlexAlign.End)
    } else {
      Column({ space: 8 }) {
        Row({ space: 6 }) {
          Text($r('app.string.role_assistant')).fontSize(12).fontColor($r('app.color.text_tertiary'))
          if (this.live) {
            LoadingProgress().width(14).height(14).color($r('app.color.accent'))
          }
        }
        ForEach(this.blocks, (block: MdBlock) => { this.blockView(block) }, (block: MdBlock, index: number) => this.version + ':' + index)
      }.width('100%').alignItems(HorizontalAlign.Start)
    }
  }
}
