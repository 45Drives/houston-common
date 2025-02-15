export default function loadingAnimation(p5: any) {
  p5.loadingAnimationSteps = 20;
  p5.loadingAnimationIndex = 0;

  p5.animateLoading = (x: number, y: number, w: number, h: number) => {
    p5.push();
    p5.colorMode(p5.RGB);
    p5.noStroke();

    const from = p5.color(100, 100, 110, 100);
    const to = p5.color(0, 0, 0, 100);
    const stepPx = h / p5.loadingAnimationSteps;
    const stepPercent = 1.0 / p5.loadingAnimationSteps;

    for (let i = 0; i < p5.loadingAnimationSteps; i++) {
      p5.fill(p5.lerpColor(from, to, stepPercent * i));
      p5.rect(
        x,
        y + stepPx * ((p5.loadingAnimationIndex + i) % p5.loadingAnimationSteps),
        w,
        stepPx
      );
    }

    p5.pop();
  };
}
