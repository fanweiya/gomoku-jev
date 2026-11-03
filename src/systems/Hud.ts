export interface GameOverExtras {
  recordText?: string;
  movesText?: string;
}

export class Hud {
  private readonly playerHuman = this.getElement('#player-human');
  private readonly playerAi = this.getElement('#player-ai');
  private readonly statusPanel = this.getElement('.status-panel');
  private readonly statusText = this.getElement('#status-text');
  private readonly subStatus = this.getElement('#sub-status');
  private readonly restartBtn = this.getElement('#restart-btn');
  private readonly undoBtn = this.getElement('#undo-btn');
  private readonly overlay = this.getElement('#game-overlay');
  private readonly overlayTitle = this.getElement('#overlay-title');
  private readonly overlayDesc = this.getElement('#overlay-desc');
  private readonly overlayRecord = this.getElement('#overlay-record');
  private readonly overlayMoves = this.getElement('#overlay-moves');
  private readonly overlayMovesText = this.getElement('#overlay-moves-text');
  private readonly overlayRestartBtn = this.getElement('#overlay-restart-btn');
  private readonly confirmOverlay = this.getElement('#confirm-overlay');
  private readonly confirmCancelBtn = this.getElement('#confirm-cancel-btn');
  private readonly confirmRestartBtn = this.getElement('#confirm-restart-btn');
  private readonly cameraHint = this.getElement('#camera-hint');

  private onRestartCallback: (() => void) | null = null;
  private onUndoCallback: (() => void) | null = null;
  /** 返回 true 表示本次重开需要先确认（对局进行中） */
  private restartGuard: (() => boolean) | null = null;
  private focusReturnElement: HTMLElement | null = null;
  private overlayTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAiThinkingSeconds = -1;

  constructor() {
    this.restartBtn.addEventListener('click', this.handleRestartClick);
    this.overlayRestartBtn.addEventListener('click', this.handleOverlayRestartClick);
    this.undoBtn.addEventListener('click', this.handleUndoClick);
    this.confirmCancelBtn.addEventListener('click', this.handleConfirmCancel);
    this.confirmRestartBtn.addEventListener('click', this.handleConfirmRestart);
    this.confirmOverlay.addEventListener('keydown', this.handleConfirmKeydown);
    this.statusPanel.addEventListener('pointerdown', this.handleStatusPointerDown);
    this.statusPanel.addEventListener('pointerup', this.clearLongPress);
    this.statusPanel.addEventListener('pointerleave', this.clearLongPress);
    this.statusPanel.addEventListener('contextmenu', this.handleStatusContextMenu);
  }

  onRestart(callback: () => void): void {
    this.onRestartCallback = callback;
  }

  onUndo(callback: () => void): void {
    this.onUndoCallback = callback;
  }

  setRestartGuard(guard: () => boolean): void {
    this.restartGuard = guard;
  }

  /** 弹窗关闭后把焦点还给这个元素（游戏画布） */
  setFocusReturn(element: HTMLElement): void {
    this.focusReturnElement = element;
  }

  setUndoEnabled(enabled: boolean): void {
    (this.undoBtn as HTMLButtonElement).disabled = !enabled;
  }

  setHumanTurn(lastMoveInfo?: string): void {
    this.lastAiThinkingSeconds = -1;
    this.playerHuman.classList.add('active');
    this.playerAi.classList.remove('active');
    this.statusText.textContent = '你的回合';
    this.subStatus.textContent = lastMoveInfo ?? '点击交叉点放置棋子';
  }

  setAiThinking(seconds: number): void {
    // 每帧都会被调用：秒数没变就不重复写 DOM
    if (seconds === this.lastAiThinkingSeconds) {
      return;
    }
    this.lastAiThinkingSeconds = seconds;
    this.playerHuman.classList.remove('active');
    this.playerAi.classList.add('active');
    this.statusText.textContent = `Jev 思考中… ${seconds}s`;
    this.subStatus.textContent = '正在计算最佳步骤';
  }

  /** 瞬时反馈（点偏、点到已占格、非本方回合点击等），只改副状态文案 */
  setHint(text: string): void {
    this.subStatus.textContent = text;
  }

  /** 按指针类型切换底部操作提示文案（触控设备没有滚轮） */
  setCameraHintText(text: string): void {
    this.cameraHint.textContent = text;
  }

  dismissCameraHint(): void {
    this.cameraHint.classList.add('hint-dismissed');
  }

  showGameOver(winner: 'human' | 'ai' | 'draw', movesCount: number, extras?: GameOverExtras): void {
    this.lastAiThinkingSeconds = -1;
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

    this.overlayRecord.toggleAttribute('hidden', !extras?.recordText);
    this.overlayRecord.textContent = extras?.recordText ?? '';
    this.overlayMoves.toggleAttribute('hidden', !extras?.movesText);
    this.overlayMovesText.textContent = extras?.movesText ?? '';
    this.overlayMoves.removeAttribute('open');

    // 延迟入场：先让获胜五连的脉冲与庆祝粒子演完，玩家看清赢线再上结算层
    if (this.overlayTimer !== null) {
      clearTimeout(this.overlayTimer);
    }
    this.overlayTimer = setTimeout(() => {
      this.overlayTimer = null;
      this.overlay.classList.remove('hidden');
      this.overlayRestartBtn.focus();
    }, 1350);
    // 闪光特效结束后自行移除
    const flash = document.createElement('div');
    flash.className = `end-flash end-flash-${winner}`;
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
    document.getElementById('app')?.appendChild(flash);
  }

  hideGameOver(): void {
    if (this.overlayTimer !== null) {
      clearTimeout(this.overlayTimer);
      this.overlayTimer = null;
    }
    const wasShown = !this.overlay.classList.contains('hidden');
    this.overlay.classList.add('hidden');
    this.overlay.classList.remove('result-win', 'result-lose', 'result-draw');
    document.querySelectorAll('.end-flash').forEach((el) => el.remove());
    if (wasShown) {
      this.focusReturnElement?.focus({ preventScroll: true });
    }
  }

  dispose(): void {
    this.restartBtn.removeEventListener('click', this.handleRestartClick);
    this.overlayRestartBtn.removeEventListener('click', this.handleOverlayRestartClick);
    this.undoBtn.removeEventListener('click', this.handleUndoClick);
    this.confirmCancelBtn.removeEventListener('click', this.handleConfirmCancel);
    this.confirmRestartBtn.removeEventListener('click', this.handleConfirmRestart);
    this.confirmOverlay.removeEventListener('keydown', this.handleConfirmKeydown);
    this.statusPanel.removeEventListener('pointerdown', this.handleStatusPointerDown);
    this.statusPanel.removeEventListener('pointerup', this.clearLongPress);
    this.statusPanel.removeEventListener('pointerleave', this.clearLongPress);
    this.statusPanel.removeEventListener('contextmenu', this.handleStatusContextMenu);
    this.clearLongPress();
    if (this.overlayTimer !== null) {
      clearTimeout(this.overlayTimer);
      this.overlayTimer = null;
    }
    this.onRestartCallback = null;
    this.onUndoCallback = null;
    this.restartGuard = null;
  }

  private readonly handleRestartClick = (): void => {
    if (this.restartGuard && this.restartGuard()) {
      this.showConfirm();
      return;
    }
    this.onRestartCallback?.();
  };

  private readonly handleOverlayRestartClick = (): void => {
    // 终局态重开不存在误触清盘风险，直达
    this.onRestartCallback?.();
  };

  private readonly handleUndoClick = (): void => {
    this.onUndoCallback?.();
  };

  private showConfirm(): void {
    this.confirmOverlay.classList.remove('hidden');
    // 安全默认：焦点落在「继续对局」上
    this.confirmCancelBtn.focus();
  }

  private hideConfirm(): void {
    this.confirmOverlay.classList.add('hidden');
    this.focusReturnElement?.focus({ preventScroll: true });
  }

  private readonly handleConfirmCancel = (): void => {
    this.hideConfirm();
  };

  private readonly handleConfirmRestart = (): void => {
    this.confirmOverlay.classList.add('hidden');
    this.onRestartCallback?.();
  };

  private readonly handleConfirmKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hideConfirm();
    }
  };

  private readonly handleStatusPointerDown = (): void => {
    this.clearLongPress();
    // 长按状态区重新显示已收起的操作提示
    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      this.cameraHint.classList.remove('hint-dismissed');
    }, 650);
  };

  private readonly clearLongPress = (): void => {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  };

  private readonly handleStatusContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
      throw new Error(`缺少 HUD 元素: ${selector}`);
    }
    return element;
  }
}
