import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { BoardView, type GridIntersection } from '../entities/BoardView';
import { Hud } from '../systems/Hud';
import {
  createBoard,
  checkWin,
  isBoardFull,
  boardToString,
  getCandidates,
  type Board,
  type Cell,
} from './GomokuCore';
import { chooseAiMove } from './JevClient';
import { disposeObject3D } from '../utils/dispose';

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  private readonly hud = new Hud();
  private readonly boardView = new BoardView();
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private readonly raycaster = new THREE.Raycaster();
  private readonly boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly planeIntersectPoint = new THREE.Vector3();

  private readonly controls: OrbitControls;
  private readonly shakeVec = new THREE.Vector3();
  private shakeRemaining = 0;
  private shakeDuration = 0.5;
  private shakeAmplitude = 0;
  private readonly pointer = new THREE.Vector2();
  private readonly pointerDownPos = new THREE.Vector2();
  private pointerDownTime = 0;

  private board: Board = createBoard();
  private turn: 'human' | 'ai' | 'over' = 'human';
  private winner: null | 'human' | 'ai' | 'draw' = null;
  private moves = 0;
  private frame = 0;
  private elapsed = 0;
  private complete = false;
  private reducedMotion = false;
  private pausedForScreenshot = false;
  private aiThinkingStartTime: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.camera.position.set(0, 16.5, 12.8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 55;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = 1.5;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.zoomToCursor = true;
    this.controls.update();
    this.fitCameraToViewport();
    // 用户转动过相机后就不再自动调整；手机转屏时若未操作过则重新适配
    this.controls.addEventListener('start', () => { this.userMovedCamera = true; });
    window.addEventListener('resize', this.onWindowResize);

    this.createScene();
    this.setupEvents();
    this.hud.onRestart(() => this.restartGame());
    this.hud.setHumanTurn();

    resizeRenderer(this.renderer, this.camera, 2);
    this.installTestHooks();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.detachEvents();
    this.controls.dispose();
    window.removeEventListener('resize', this.onWindowResize);
    this.hud.dispose();
    this.boardView.dispose();
    // 释放 createScene() 中直接挂在 scene 上的 table/灯光（boardView 已自行释放，重复 dispose 安全）
    disposeObject3D(this.scene);
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }
    if (!this.complete) {
      this.elapsed += delta;
    }

    resizeRenderer(this.renderer, this.camera, 2);

    if (this.turn === 'ai' && this.aiThinkingStartTime !== null) {
      const seconds = Math.floor((performance.now() - this.aiThinkingStartTime) / 1000);
      this.hud.setAiThinking(seconds);
    }

    this.controls.update();
    if (this.shakeRemaining > 0) {
      this.shakeRemaining = Math.max(0, this.shakeRemaining - delta);
    }

    this.boardView.update(delta, elapsed);
    this.publishDiagnostics();
  }

  private render(): void {
    const shake = this.getShakeOffset();
    this.camera.position.add(shake);
    this.renderer.render(this.scene, this.camera);
    this.camera.position.sub(shake);
  }

  private triggerShake(kind: 'win' | 'lose'): void {
    if (this.reducedMotion) return;
    this.shakeDuration = 0.5;
    this.shakeAmplitude = kind === 'win' ? 0.22 : 0.4;
    this.shakeRemaining = this.shakeDuration;
  }

  private getShakeOffset(): THREE.Vector3 {
    if (this.reducedMotion || this.shakeRemaining <= 0) {
      return this.shakeVec.set(0, 0, 0);
    }
    const intensity = (this.shakeRemaining / this.shakeDuration) * this.shakeAmplitude;
    return this.shakeVec
      .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .multiplyScalar(intensity);
  }

  private userMovedCamera = false;

  private readonly onWindowResize = (): void => {
    if (!this.userMovedCamera) {
      this.fitCameraToViewport();
    }
  };

  /** 按视口宽高比调整初始相机距离：窄竖屏拉远，保证棋盘横向完整入画 */
  private fitCameraToViewport(): void {
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    // 棋盘对角线约 23；竖屏(aspect<0.7)拉到远景，横屏保持中景
    const distance = aspect < 0.7 ? 42 : aspect < 1.1 ? 30 : 21;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, distance);
    this.controls.update();
  }

  private createScene(): void {
    this.scene.background = new THREE.Color('#111312');

    const hemisphere = new THREE.HemisphereLight('#f5efe6', '#1d2024', 1.6);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight('#fff2d8', 2.4);
    sun.position.set(-7, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 36;
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    this.scene.add(sun);

    const rimLight = new THREE.DirectionalLight('#7fa4ba', 0.45);
    rimLight.position.set(8, 8, -8);
    this.scene.add(rimLight);

    // 深色木桌面，承接棋盘与棋罐的投影
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 0.92, metalness: 0.02 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.7;
    table.receiveShadow = true;
    this.scene.add(table);

    this.scene.add(this.boardView.group);
  }

  private setupEvents(): void {
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  private detachEvents(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    if (this.turn !== 'human') {
      this.boardView.hideGhost();
      return;
    }

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.boardPlane, this.planeIntersectPoint);

    if (hit) {
      const cell = this.boardView.getIntersectionAt(
        this.planeIntersectPoint.x,
        this.planeIntersectPoint.z,
      );
      if (cell && this.board[cell.row][cell.col] === 0) {
        this.boardView.showGhost(cell.row, cell.col);
        return;
      }
    }

    this.boardView.hideGhost();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDownPos.set(event.clientX, event.clientY);
    this.pointerDownTime = performance.now();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = performance.now() - this.pointerDownTime;

    if (distance > 10 || duration > 700) {
      return;
    }

    if (this.turn !== 'human') {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.boardPlane, this.planeIntersectPoint);

    if (hit) {
      const cell = this.boardView.getIntersectionAt(
        this.planeIntersectPoint.x,
        this.planeIntersectPoint.z,
      );
      if (cell && this.board[cell.row][cell.col] === 0) {
        this.handleHumanMove(cell.row, cell.col);
      }
    }
  };

  private readonly onPointerLeave = (): void => {
    this.boardView.hideGhost();
  };

  private handleHumanMove(row: number, col: number): void {
    this.board[row][col] = 1;
    this.moves += 1;
    this.boardView.placePiece(row, col, 1, this.reducedMotion);
    this.boardView.hideGhost();

    if (checkWin(this.board, row, col)) {
      this.winner = 'human';
      this.turn = 'over';
      this.complete = true;
      const line = this.findWinningLine(row, col, 1);
      this.boardView.highlightWinningPieces(line);
      this.boardView.celebrate(line, this.reducedMotion);
      this.triggerShake('win');
      this.hud.showGameOver('human', this.moves);
      this.publishDiagnostics();
      return;
    }

    if (isBoardFull(this.board)) {
      this.winner = 'draw';
      this.turn = 'over';
      this.complete = true;
      this.hud.showGameOver('draw', this.moves);
      this.publishDiagnostics();
      return;
    }

    this.turn = 'ai';
    this.aiThinkingStartTime = performance.now();
    this.hud.setAiThinking(0);
    this.publishDiagnostics();

    void this.executeAiTurn();
  }

  private async executeAiTurn(): Promise<void> {
    try {
      const candidates = getCandidates(this.board, 2);
      const boardString = boardToString(this.board);
      const choice = await chooseAiMove(boardString, candidates);

      if (this.turn !== 'ai') {
        return;
      }

      const { row, col, key, confidence } = choice;
      this.board[row][col] = 2;
      this.moves += 1;
      this.boardView.placePiece(row, col, 2, this.reducedMotion);

      if (checkWin(this.board, row, col)) {
        this.winner = 'ai';
        this.turn = 'over';
        this.complete = true;
        const line = this.findWinningLine(row, col, 2);
        this.boardView.highlightWinningPieces(line);
        this.boardView.celebrate(line, this.reducedMotion);
        this.triggerShake('lose');
        this.hud.showGameOver('ai', this.moves);
        this.publishDiagnostics();
        return;
      }

      if (isBoardFull(this.board)) {
        this.winner = 'draw';
        this.turn = 'over';
        this.complete = true;
        this.hud.showGameOver('draw', this.moves);
        this.publishDiagnostics();
        return;
      }

      this.turn = 'human';
      this.aiThinkingStartTime = null;
      const confidenceText = typeof confidence === 'number' ? confidence.toFixed(2) : '1.00';
      this.hud.setHumanTurn(`Jev: ${key} (${confidenceText})`);
      this.publishDiagnostics();
    } catch (error) {
      console.error('AI 走棋处理发生异常:', error);
      // 异常兜底：把回合交还给玩家，避免永久卡死在"思考中"
      if (this.turn === 'ai') {
        this.turn = 'human';
        this.aiThinkingStartTime = null;
        this.hud.setHumanTurn('AI 出错，已交还回合');
        this.publishDiagnostics();
      }
    }
  }

  private findWinningLine(row: number, col: number, color: Cell): GridIntersection[] {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (const [dr, dc] of directions) {
      const line: GridIntersection[] = [{ row, col }];

      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 15 && c >= 0 && c < 15 && this.board[r][c] === color) {
        line.push({ row: r, col: c });
        r += dr;
        c += dc;
      }

      r = row - dr;
      c = col - dc;
      while (r >= 0 && r < 15 && c >= 0 && c < 15 && this.board[r][c] === color) {
        line.unshift({ row: r, col: c });
        r -= dr;
        c -= dc;
      }

      if (line.length >= 5) {
        return line;
      }
    }

    return [{ row, col }];
  }

  private restartGame(): void {
    this.board = createBoard();
    this.turn = 'human';
    this.winner = null;
    this.moves = 0;
    this.complete = false;
    this.aiThinkingStartTime = null;

    this.boardView.reset();
    this.shakeRemaining = 0;
    this.hud.hideGameOver();
    this.hud.setHumanTurn();
    this.publishDiagnostics();
  }

  private simulateCompleteForTest(): void {
    this.restartGame();

    const winLine: GridIntersection[] = [];
    for (let c = 3; c <= 7; c++) {
      this.board[7][c] = 1;
      this.boardView.placePiece(7, c, 1, true);
      winLine.push({ row: 7, col: c });
    }

    for (let c = 3; c <= 6; c++) {
      this.board[8][c] = 2;
      this.boardView.placePiece(8, c, 2, true);
    }

    this.moves = 9;
    this.complete = true;
    this.winner = 'human';
    this.turn = 'over';

    this.boardView.highlightWinningPieces(winLine);
    this.boardView.celebrate(winLine, this.reducedMotion);
    this.triggerShake('win');
    this.hud.showGameOver('human', this.moves);
    this.publishDiagnostics();
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (_value: number) => {},
      setState: (name: string) => {
        if (name === 'active-play') {
          this.restartGame();
          this.render();
          this.publishDiagnostics();
          return { state: name };
        }
        if (name === 'complete') {
          this.simulateCompleteForTest();
          this.render();
          this.publishDiagnostics();
          return { state: name };
        }
        throw new Error(`未知测试状态: ${name}`);
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
        this.render();
        this.publishDiagnostics();
      },
      hideDebugUi: (_hidden: boolean) => {},
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: 0,
      targetScore: 0,
      complete: this.complete,
      player: {
        position: { x: 0, y: 0, z: 0 },
        speed: 0,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      },
      moves: this.moves,
      turn: this.turn,
      winner: this.winner,
      camera: {
        position: {
          x: this.camera.position.x,
          y: this.camera.position.y,
          z: this.camera.position.z,
        },
        distance: this.camera.position.distanceTo(this.controls.target),
      },
      pieces: this.boardView.getDebugCounts(),
    };
  }
}
