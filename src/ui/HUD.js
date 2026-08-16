/** Placeholder HUD. Owned by the UI agent. */
export class HUD {
  async init(game) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    game.uiRoot.appendChild(this.root);
    this.visible = true;
  }
  setVisible(v) { this.visible = v; this.root.style.display = v ? '' : 'none'; }
  lateUpdate() {}
}
