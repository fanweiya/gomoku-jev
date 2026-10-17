import * as THREE from 'three';

export interface GridIntersection {
  row: number;
  col: number;
}

interface PieceAnimation {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  target: THREE.Vector3;
  arcHeight: number;
  progress: number;
  duration: number;
}

interface BowlPile {
  color: 1 | 2;
  meshes: THREE.Mesh[];
  /** 下一个待取棋子的下标（从顶层往下消耗，取完为 0） */
  next: number;
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class BoardView {
  readonly group = new THREE.Group();

  private readonly boardWidth = 16.4;
  private readonly boardHeight = 0.7;
  private readonly gridSpacing = 1.0;
  private readonly boardSize = 15;

  private boardMesh!: THREE.Mesh;
  private boardTexture!: THREE.CanvasTexture;

  private readonly pieceGeometry = new THREE.SphereGeometry(0.42, 32, 24);
  private readonly blackMaterial = new THREE.MeshStandardMaterial({
    color: '#141416',
    roughness: 0.16,
    metalness: 0.12,
  });
  private readonly whiteMaterial = new THREE.MeshStandardMaterial({
    color: '#f4f0e6',
    roughness: 0.42,
    metalness: 0.05,
  });
  private readonly ghostMaterial = new THREE.MeshStandardMaterial({
    color: '#141416',
    transparent: true,
    opacity: 0.45,
  });

  private readonly markerGeometry = new THREE.CylinderGeometry(0.065, 0.065, 0.015, 16);
  private readonly markerMaterial = new THREE.MeshBasicMaterial({ color: '#e74c3c' });
  private readonly lastMoveMarker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);

  private readonly piecesGroup = new THREE.Group();
  private readonly ghostPiece: THREE.Mesh;

  private readonly placedPieces: (THREE.Mesh | null)[][] = [];
  private readonly animations: PieceAnimation[] = [];
  private winningPieces: THREE.Mesh[] = [];

  // 棋罐（棋笥）：棋盘两侧存放黑白棋子，落子时棋子从罐内飞出并消耗存量
  private readonly bowls = new THREE.Group();
  private readonly bowlPiles: BowlPile[] = [];
  private readonly bowlWorldTop: Record<1 | 2, THREE.Vector3> = {
    1: new THREE.Vector3(-10.8, 1.0, 0),
    2: new THREE.Vector3(10.8, 1.0, 0),
  };
  private readonly bowlGeometry = new THREE.SphereGeometry(1.55, 36, 24, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
  private readonly pileStoneGeometry = new THREE.SphereGeometry(0.34, 20, 14);
  private readonly bowlMaterial = new THREE.MeshStandardMaterial({
    color: '#5a3a22',
    roughness: 0.5,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  private readonly rimMaterial = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.4 });
  private readonly rimGeometry = new THREE.TorusGeometry(1.55, 0.09, 12, 48);

  // 终局庆祝粒子
  private readonly particles: Particle[] = [];
  private readonly particleGeometry = new THREE.TetrahedronGeometry(0.14);
  private readonly particleMaterials: THREE.MeshBasicMaterial[] = [];

  constructor() {
    this.createBoardMesh();
    this.group.add(this.boardMesh);

    this.ghostPiece = new THREE.Mesh(this.pieceGeometry, this.ghostMaterial);
    this.ghostPiece.scale.set(1, 0.38, 1);
    this.ghostPiece.visible = false;
    this.group.add(this.ghostPiece);

    this.lastMoveMarker.visible = false;
    this.group.add(this.lastMoveMarker);

    this.group.add(this.piecesGroup);

    for (let r = 0; r < this.boardSize; r++) {
      this.placedPieces[r] = new Array(this.boardSize).fill(null);
    }

    this.createBowls();
  }

  getIntersectionAt(worldX: number, worldZ: number): GridIntersection | null {
    const halfGrid = (this.boardSize - 1) / 2;
    const col = Math.round(worldX / this.gridSpacing + halfGrid);
    const row = Math.round(worldZ / this.gridSpacing + halfGrid);

    if (row < 0 || row >= this.boardSize || col < 0 || col >= this.boardSize) {
      return null;
    }

    const snapX = (col - halfGrid) * this.gridSpacing;
    const snapZ = (row - halfGrid) * this.gridSpacing;
    const dx = worldX - snapX;
    const dz = worldZ - snapZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 0.4 * this.gridSpacing) {
      return { row, col };
    }
    return null;
  }

  showGhost(row: number, col: number): void {
    const halfGrid = (this.boardSize - 1) / 2;
    const posX = (col - halfGrid) * this.gridSpacing;
    const posZ = (row - halfGrid) * this.gridSpacing;

    this.ghostPiece.position.set(posX, 0.16, posZ);
    this.ghostPiece.visible = true;
  }

  hideGhost(): void {
    this.ghostPiece.visible = false;
  }

  /** 从棋罐顶层取走一子（隐藏存量），返回该子的世界坐标作为起飞点 */
  private takePileStone(color: 1 | 2): THREE.Vector3 {
    const pile = this.bowlPiles.find((p) => p.color === color);
    const fallback = this.bowlWorldTop[color].clone();
    if (!pile || pile.next <= 0) return fallback;
    const stone = pile.meshes[pile.next - 1];
    pile.next -= 1;
    stone.visible = false;
    const position = new THREE.Vector3();
    stone.getWorldPosition(position);
    position.y += 0.3;
    return position;
  }

  /** 供诊断：当前盘上可见棋子数与两个棋罐剩余存量 */
  getDebugCounts(): { boardPieces: number; pileBlack: number; pileWhite: number; flying: number } {
    let boardPieces = 0;
    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        const mesh = this.placedPieces[r][c];
        if (mesh && mesh.visible) boardPieces += 1;
      }
    }
    const pileBlack = this.bowlPiles.find((p) => p.color === 1)?.next ?? 0;
    const pileWhite = this.bowlPiles.find((p) => p.color === 2)?.next ?? 0;
    return { boardPieces, pileBlack, pileWhite, flying: this.animations.length };
  }

  placePiece(row: number, col: number, color: 1 | 2, reducedMotion = false): void {
    const existing = this.placedPieces[row][col];
    if (existing) {
      this.piecesGroup.remove(existing);
      // 旧棋子的材质是 clone 出来的，移除时一并释放，避免泄漏
      (existing.material as THREE.Material).dispose();
    }

    const material = (color === 1 ? this.blackMaterial : this.whiteMaterial).clone();
    const mesh = new THREE.Mesh(this.pieceGeometry, material);
    mesh.scale.set(1, 0.38, 1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const halfGrid = (this.boardSize - 1) / 2;
    const posX = (col - halfGrid) * this.gridSpacing;
    const posZ = (row - halfGrid) * this.gridSpacing;
    const targetY = 0.16;

    if (reducedMotion) {
      mesh.position.set(posX, targetY, posZ);
    } else {
      // 棋子从棋罐飞出，沿弧线落到目标交叉点
      const spawn = this.takePileStone(color);
      mesh.position.copy(spawn);
      this.animations.push({
        mesh,
        start: spawn.clone(),
        target: new THREE.Vector3(posX, targetY, posZ),
        arcHeight: 2.2,
        progress: 0,
        duration: 0.42,
      });
    }

    this.piecesGroup.add(mesh);
    this.placedPieces[row][col] = mesh;

    this.lastMoveMarker.position.set(posX, 0.32, posZ);
    this.lastMoveMarker.visible = true;
  }

  highlightWinningPieces(cells: GridIntersection[]): void {
    this.winningPieces = [];
    for (const cell of cells) {
      const mesh = this.placedPieces[cell.row]?.[cell.col];
      if (mesh) {
        this.winningPieces.push(mesh);
      }
    }
  }

  /** 终局庆祝：从获胜五连子向上喷彩色粒子 */
  celebrate(cells: GridIntersection[], reducedMotion = false): void {
    if (reducedMotion) return;

    const colors = ['#f5ba49', '#ffd98a', '#48baa7', '#f6f1df', '#e8734a'];
    for (const cell of cells) {
      const mesh = this.placedPieces[cell.row]?.[cell.col];
      if (!mesh) continue;
      const origin = mesh.position.clone();

      for (let i = 0; i < 14; i++) {
        const material = new THREE.MeshBasicMaterial({
          color: colors[i % colors.length],
          transparent: true,
          opacity: 1,
        });
        this.particleMaterials.push(material);
        const particle = new THREE.Mesh(this.particleGeometry, material);
        particle.position.copy(origin).add(new THREE.Vector3(0, 0.4, 0));

        const angle = Math.random() * Math.PI * 2;
        const speed = 2.5 + Math.random() * 4.5;
        this.particles.push({
          mesh: particle,
          velocity: new THREE.Vector3(
            Math.cos(angle) * speed * 0.55,
            4 + Math.random() * 5,
            Math.sin(angle) * speed * 0.55,
          ),
          life: 0,
          maxLife: 1.1 + Math.random() * 0.7,
        });
        this.group.add(particle);
      }
    }
  }

  update(delta: number, elapsed: number): void {
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i];
      anim.progress += delta / anim.duration;
      const p = Math.min(anim.progress, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      anim.mesh.position.lerpVectors(anim.start, anim.target, ease);
      anim.mesh.position.y += Math.sin(p * Math.PI) * anim.arcHeight;
      if (anim.progress >= 1.0) {
        anim.mesh.position.copy(anim.target);
        this.animations.splice(i, 1);
      }
    }

    if (this.winningPieces.length > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 7);
      for (const mesh of this.winningPieces) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.set('#f5ba49');
        mat.emissiveIntensity = 0.4 + 0.6 * pulse;
      }
    }

    // 粒子物理：重力 + 生命周期淡出
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;
      if (p.life >= p.maxLife) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= 12 * delta;
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.mesh.rotation.x += delta * 6;
      p.mesh.rotation.y += delta * 4;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 1 - Math.pow(p.life / p.maxLife, 2);
    }
  }

  reset(): void {
    this.animations.length = 0;
    this.winningPieces = [];

    for (const p of this.particles) {
      this.group.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles.length = 0;
    // 粒子材质已在上面逐个 dispose，这里清空引用避免数组无限增长
    this.particleMaterials.length = 0;

    // 棋罐补满
    for (const pile of this.bowlPiles) {
      pile.next = pile.meshes.length;
      for (const mesh of pile.meshes) {
        mesh.visible = true;
      }
    }

    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        const mesh = this.placedPieces[r][c];
        if (mesh) {
          this.piecesGroup.remove(mesh);
          (mesh.material as THREE.Material).dispose();
          this.placedPieces[r][c] = null;
        }
      }
    }

    this.lastMoveMarker.visible = false;
    this.ghostPiece.visible = false;
  }

  dispose(): void {
    this.reset();
    this.boardTexture.dispose();
    this.pieceGeometry.dispose();
    this.markerGeometry.dispose();
    this.blackMaterial.dispose();
    this.whiteMaterial.dispose();
    this.ghostMaterial.dispose();
    this.markerMaterial.dispose();
    this.bowlGeometry.dispose();
    this.bowlMaterial.dispose();
    this.rimGeometry.dispose();
    this.rimMaterial.dispose();
    this.pileStoneGeometry.dispose();
    this.particleGeometry.dispose();
    for (const material of this.particleMaterials.splice(0)) material.dispose();
    (this.boardMesh.material as THREE.Material[]).forEach((mat) => mat.dispose());
    this.boardMesh.geometry.dispose();
  }

  /** 棋盘左右两个棋罐：左黑右白，罐内堆满棋子，随对局消耗 */
  private createBowls(): void {
    const tableY = -this.boardHeight;

    const offset = this.boardWidth / 2 + 2.6;
    const setups: { x: number; stoneMat: THREE.MeshStandardMaterial; color: 1 | 2 }[] = [
      { x: -offset, stoneMat: this.blackMaterial, color: 1 },
      { x: offset, stoneMat: this.whiteMaterial, color: 2 },
    ];

    for (const setup of setups) {
      const bowlGroup = new THREE.Group();

      // 半球（thetaStart=PI/2）天然是开口朝上的碗形，不能再翻转
      const shell = new THREE.Mesh(this.bowlGeometry, this.bowlMaterial);
      shell.position.y = 1.55;
      shell.castShadow = true;
      shell.receiveShadow = true;
      bowlGroup.add(shell);

      const rim = new THREE.Mesh(this.rimGeometry, this.rimMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 1.55;
      rim.castShadow = true;
      bowlGroup.add(rim);

      // 罐内棋子堆：三层同心环，从上层开始消耗
      const pile = new THREE.Group();
      const layers = [
        { y: 0.95, rings: [{ r: 0, n: 1 }, { r: 0.5, n: 5 }, { r: 1.0, n: 9 }] },
        { y: 1.18, rings: [{ r: 0, n: 1 }, { r: 0.55, n: 6 }] },
        { y: 1.4, rings: [{ r: 0.38, n: 4 }] },
        // 第四层：把每色可视棋子从 26 颗加到 40 颗，长对局（50+ 手）飞子动画不再降级
        { y: 1.62, rings: [{ r: 0, n: 1 }, { r: 0.45, n: 5 }, { r: 0.9, n: 8 }] },
      ];
      const meshes: THREE.Mesh[] = [];
      for (const layer of layers) {
        for (const ring of layer.rings) {
          for (let i = 0; i < ring.n; i++) {
            const angle = (i / ring.n) * Math.PI * 2 + (ring.r > 0 ? 0.3 : 0);
            const stone = new THREE.Mesh(this.pileStoneGeometry, setup.stoneMat);
            stone.position.set(
              Math.cos(angle) * ring.r,
              layer.y,
              Math.sin(angle) * ring.r,
            );
            stone.castShadow = true;
            pile.add(stone);
            meshes.push(stone);
          }
        }
      }
      bowlGroup.add(pile);

      bowlGroup.position.set(setup.x, tableY, 0);
      this.bowls.add(bowlGroup);

      this.bowlPiles.push({ color: setup.color, meshes, next: meshes.length });
      this.bowlWorldTop[setup.color] = new THREE.Vector3(setup.x, tableY + 1.7, 0);
    }

    this.group.add(this.bowls);
  }

  private createBoardMesh(): void {
    this.boardTexture = this.createProceduralTexture();

    const topMaterial = new THREE.MeshStandardMaterial({
      map: this.boardTexture,
      roughness: 0.45,
      metalness: 0.04,
    });

    const sideMaterial = new THREE.MeshStandardMaterial({
      color: '#6e4720',
      roughness: 0.6,
      metalness: 0.05,
    });

    const materials = [
      sideMaterial,
      sideMaterial,
      topMaterial,
      sideMaterial,
      sideMaterial,
      sideMaterial,
    ];

    const geometry = new THREE.BoxGeometry(this.boardWidth, this.boardHeight, this.boardWidth);
    this.boardMesh = new THREE.Mesh(geometry, materials);
    this.boardMesh.position.set(0, -this.boardHeight / 2, 0);
    this.boardMesh.receiveShadow = true;
  }

  private createProceduralTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建 Canvas 2D 绘图上下文');
    }

    const gradient = ctx.createLinearGradient(0, 0, 2048, 2048);
    gradient.addColorStop(0, '#e5b877');
    gradient.addColorStop(0.5, '#deb06e');
    gradient.addColorStop(1, '#cf9e5a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2048, 2048);

    ctx.fillStyle = 'rgba(100, 50, 10, 0.025)';
    for (let y = 0; y < 2048; y += 4) {
      const stripeHeight = ((y * 13) % 7) + 1;
      ctx.fillRect(0, y, 2048, stripeHeight);
    }

    const margin = 148;
    const playableSize = 2048 - margin * 2;
    const cellPx = playableSize / (this.boardSize - 1);

    ctx.strokeStyle = 'rgba(40, 22, 10, 0.9)';
    ctx.lineWidth = 6;
    ctx.strokeRect(margin, margin, playableSize, playableSize);

    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < this.boardSize; i++) {
      const pos = margin + i * cellPx;
      ctx.moveTo(margin, pos);
      ctx.lineTo(margin + playableSize, pos);
      ctx.moveTo(pos, margin);
      ctx.lineTo(pos, margin + playableSize);
    }
    ctx.stroke();

    const starPoints = [
      { r: 3, c: 3 },
      { r: 3, c: 11 },
      { r: 7, c: 7 },
      { r: 11, c: 3 },
      { r: 11, c: 11 },
    ];

    ctx.fillStyle = 'rgba(32, 18, 8, 0.95)';
    for (const point of starPoints) {
      const px = margin + point.c * cellPx;
      const py = margin + point.r * cellPx;
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(60, 36, 16, 0.72)';
    ctx.font = '600 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];
    for (let c = 0; c < this.boardSize; c++) {
      const x = margin + c * cellPx;
      ctx.fillText(cols[c], x, margin - 52);
      ctx.fillText(cols[c], x, margin + playableSize + 52);
    }

    for (let r = 0; r < this.boardSize; r++) {
      const y = margin + r * cellPx;
      const label = String(r + 1);
      ctx.fillText(label, margin - 52, y);
      ctx.fillText(label, margin + playableSize + 52, y);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return texture;
  }
}
