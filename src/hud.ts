// 分數與死亡畫面：純 DOM，不進 3D 場景。

export class Hud {
  private readonly score = document.getElementById("hud")!;
  private readonly death = document.getElementById("death")!;
  private readonly deathScore = document.getElementById("death-score")!;

  setDistance(meters: number): void {
    this.score.textContent = `${Math.floor(meters)} m`;
  }

  showDeath(meters: number): void {
    this.deathScore.textContent = `這次走了 ${Math.floor(meters)} 公尺`;
    this.death.classList.add("show");
  }

  hideDeath(): void {
    this.death.classList.remove("show");
  }
}
