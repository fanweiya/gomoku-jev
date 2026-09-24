export class Hud {
  private readonly playerHuman = this.getElement('#player-human');
  private readonly playerAi = this.getElement('#player-ai');
  private readonly statusText = this.getElement('#status-text');
  private readonly subStatus = this.getElement('#sub-status');
  private readonly restartBtn = this.getElement('#restart-btn');
  private readonly overlay = this.getElement('#game-overlay');
  private readonly overlayTitle = this.getElement('#overlay-title');
  private readonly overlayDesc = this.getElement('#overlay-desc');
  private readonly overlayRestartBtn = this.getElement('#overlay-restart-btn');

  private onRestartCallback: (() => void) | null = null;

  constructor() {
    this.restartBtn.addEventListener('click', this.handleRestartClick);
    this.overlayRestartBtn.addEventListener('click', this.handleRestartClick);
  }

  onRestart(callback: () => void): void {
    this.onRestartCallback = callback;
  }

  setHumanTurn(lastMoveInfo?: string): void {
    this.playerHuman.classList.add('active');
    this.playerAi.classList.remove('active');
    this.statusText.textContent = '你的回合';
    this.subStatus.textContent = lastMoveInfo ?? '点击交叉点放置棋子';
  }

  setAiThinking(seconds: number): void {
    this.playerHuman.classList.remove('active');
    this.playerAi.classList.add('active');
    this.statusText.textContent = `Jev 思考中… ${seconds}s`;
    this.subStatus.textContent = '正在计算最佳步骤';
  }

  setMoveResult(text: string): void {
    this.subStatus.textContent = text;
  }

  showGameOver(winner: 'human' | 'ai' | 'draw', movesCount: number): void {
    this.playerHuman.classList.remove('active');
    this.playerAi.classList.remove('active');
    this.overlay.classList.remove('result-win', 'result-lose', 'result-draw');

    if (winner === 'human') {
      this.overlay.classList.add('result-win');
      this.overlayTitle.textContent = '你赢了';
      this.overlayDesc.textContent = `共 ${movesCount} 手 · 执黑连五获胜`;
      this.statusText.textContent = '对局结束';
      this.subStatus.textContent = '你赢了';
    } else if (winner === 'ai') {
      this.overlay.classList.add('result-lose');
      this.overlayTitle.textContent = 'Jev 获胜';
      this.overlayDesc.textContent = `共 ${movesCount} 手 · 执白连五获胜`;
      this.statusText.textContent = '对局结束';
      this.subStatus.textContent = 'Jev 获胜';
    } else {
      this.overlay.classList.add('result-draw');
      this.overlayTitle.textContent = '和棋';
      this.overlayDesc.textContent = `共 ${movesCount} 手 · 棋盘已满`;
      this.statusText.textContent = '对局结束';
      this.subStatus.textContent = '和棋';
    }

    this.overlay.classList.remove('hidden');
    // 闪光特效结束后自行移除
    const flash = document.createElement('div');
    flash.className = `end-flash end-flash-${winner}`;
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
    document.getElementById('app')?.appendChild(flash);
  }

  hideGameOver(): void {
    this.overlay.classList.add('hidden');
    this.overlay.classList.remove('result-win', 'result-lose', 'result-draw');
    document.querySelectorAll('.end-flash').forEach((el) => el.remove());
  }

  dispose(): void {
    this.restartBtn.removeEventListener('click', this.handleRestartClick);
    this.overlayRestartBtn.removeEventListener('click', this.handleRestartClick);
    this.onRestartCallback = null;
  }

  private readonly handleRestartClick = (): void => {
    if (this.onRestartCallback) {
      this.onRestartCallback();
    }
  };

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
      throw new Error(`缺少 HUD 元素: ${selector}`);
    }
    return element;
  }
}
