/** Trusted native connection presentation; fixture is the default until a native transport provider is enabled. */
export enum ConnectionMode { Fixture, ReplayService }
/** Local transport state, independently of task admission or completion. */
export enum ConnectionStatus { Disabled, Connecting, Connected, Disconnected }

/** Future native transport binds these props; generated guest content receives no status or configuration setter. */
@Component
export struct ConnectionBadge {
  @Prop mode: ConnectionMode = ConnectionMode.Fixture
  @Prop status: ConnectionStatus = ConnectionStatus.Disabled

  build() {
    if (this.mode === ConnectionMode.Fixture) {
      Text($r('app.string.mock_notice')).fontSize(14)
    } else if (this.status === ConnectionStatus.Connected) {
      Text($r('app.string.replay_connected')).fontSize(14)
    } else if (this.status === ConnectionStatus.Connecting) {
      Text($r('app.string.transport_connecting')).fontSize(14)
    } else if (this.status === ConnectionStatus.Disconnected) {
      Text($r('app.string.transport_disconnected')).fontSize(14)
    } else {
      Text($r('app.string.transport_disabled')).fontSize(14)
    }
  }
}
