const puppeteer = require('puppeteer');
const fs = require('fs');

async function renderThumbnails() {
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Load User UI
  const userUiPath = 'c:/h2F/dist/store-assets/user_plugin_ui.png';
  const base64UserUi = fs.readFileSync(userUiPath).toString('base64');

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body, html {
          width: 1920px;
          height: 1080px;
          overflow: hidden;
          background: #07090e;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #fff;
          position: relative;
        }

        /* Ambient Lighting */
        .ambient-glow-1 {
          position: absolute;
          width: 900px;
          height: 900px;
          top: -150px;
          right: -50px;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.28) 0%, rgba(99, 102, 241, 0.16) 45%, transparent 70%);
          filter: blur(70px);
          z-index: 1;
        }
        .ambient-glow-2 {
          position: absolute;
          width: 750px;
          height: 750px;
          bottom: -150px;
          left: 100px;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.18) 0%, rgba(139, 92, 246, 0.12) 50%, transparent 70%);
          filter: blur(80px);
          z-index: 1;
        }
        .ambient-glow-3 {
          position: absolute;
          width: 500px;
          height: 500px;
          bottom: 100px;
          right: 350px;
          background: radial-gradient(circle, rgba(236, 72, 153, 0.18) 0%, transparent 65%);
          filter: blur(60px);
          z-index: 1;
        }

        /* Background Grid */
        .bg-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
          background-size: 54px 54px;
          z-index: 2;
          mask-image: radial-gradient(circle at 55% 50%, black 40%, transparent 95%);
        }

        .layout-root {
          position: relative;
          z-index: 10;
          width: 1920px;
          height: 1080px;
          display: flex;
          align-items: center;
          padding: 70px 110px;
          gap: 70px;
        }

        /* LEFT CONTENT */
        .left-content {
          flex: 1.1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          max-width: 860px;
        }

        .category-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 18px;
          border-radius: 999px;
          background: rgba(168, 85, 247, 0.14);
          border: 1px solid rgba(192, 132, 252, 0.4);
          box-shadow: 0 0 25px rgba(168, 85, 247, 0.28);
          width: fit-content;
          margin-bottom: 26px;
        }
        .category-pill .sparkle {
          color: #c084fc;
          font-size: 15px;
        }
        .category-pill .label {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          background: linear-gradient(90deg, #c084fc, #38bdf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-title {
          font-size: 86px;
          font-weight: 900;
          line-height: 1.02;
          letter-spacing: -0.045em;
          margin-bottom: 24px;
          color: #ffffff;
        }
        .hero-title .title-gradient {
          background: linear-gradient(135deg, #ffffff 30%, #c084fc 65%, #38bdf8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-description {
          font-size: 23px;
          line-height: 1.48;
          color: #94a3b8;
          font-weight: 450;
          margin-bottom: 38px;
          max-width: 730px;
        }

        /* FEATURES GRID */
        .features-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 40px;
          max-width: 760px;
        }
        .feature-card {
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 14px;
          padding: 14px 20px;
          backdrop-filter: blur(14px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
        }
        .feature-icon {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 19px;
          flex-shrink: 0;
        }
        .icon-blue { background: rgba(56, 189, 248, 0.16); border: 1px solid rgba(56, 189, 248, 0.35); }
        .icon-purple { background: rgba(192, 132, 252, 0.16); border: 1px solid rgba(192, 132, 252, 0.35); }
        .icon-pink { background: rgba(244, 114, 182, 0.16); border: 1px solid rgba(244, 114, 182, 0.35); }
        .icon-emerald { background: rgba(52, 211, 153, 0.16); border: 1px solid rgba(52, 211, 153, 0.35); }

        .feature-info h4 {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          margin-bottom: 3px;
        }
        .feature-info p {
          font-size: 12.5px;
          color: #64748b;
          font-weight: 500;
        }

        /* BOTTOM PILLS */
        .badges-footer {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        .badge-pill-free {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 18px;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.38);
          color: #34d399;
          font-size: 13.5px;
          font-weight: 700;
        }
        .badge-pill-pro {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 18px;
          border-radius: 999px;
          background: rgba(147, 51, 234, 0.15);
          border: 1px solid rgba(168, 85, 247, 0.38);
          color: #c084fc;
          font-size: 13.5px;
          font-weight: 700;
        }

        /* RIGHT SHOWCASE COLUMN */
        .right-showcase {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          height: 100%;
        }

        .showcase-stage {
          position: relative;
          width: 820px;
          height: 860px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Ambient Glow Behind Stage */
        .stage-glow {
          position: absolute;
          width: 650px;
          height: 780px;
          background: radial-gradient(circle, rgba(168, 85, 247, 0.38) 0%, rgba(56, 189, 248, 0.22) 45%, transparent 75%);
          filter: blur(65px);
          z-index: 1;
        }

        /* BACKGROUND BROWSER WINDOW */
        .browser-mock {
          position: absolute;
          left: 10px;
          top: 60px;
          width: 460px;
          height: 640px;
          background: #0f1523;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          box-shadow: 0 35px 80px rgba(0, 0, 0, 0.75);
          overflow: hidden;
          z-index: 2;
          transform: perspective(1200px) rotateY(8deg) rotateX(2deg) scale(0.96);
          opacity: 0.94;
        }
        .browser-header {
          height: 40px;
          background: #171f33;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          padding: 0 16px;
          gap: 14px;
        }
        .browser-traffic {
          display: flex;
          gap: 6px;
        }
        .traffic-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }
        .t-red { background: #ef4444; }
        .t-yellow { background: #f59e0b; }
        .t-green { background: #10b981; }
        .browser-address {
          flex: 1;
          height: 24px;
          background: rgba(255, 255, 255, 0.07);
          border-radius: 6px;
          display: flex;
          align-items: center;
          padding: 0 12px;
          font-size: 11.5px;
          font-family: 'JetBrains Mono', monospace;
          color: #94a3b8;
        }
        .browser-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .web-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          padding-bottom: 16px;
        }
        .nav-logo {
          width: 80px;
          height: 14px;
          background: linear-gradient(90deg, #38bdf8, #818cf8);
          border-radius: 4px;
        }
        .nav-links {
          display: flex;
          gap: 12px;
        }
        .nav-link-pill {
          width: 36px;
          height: 9px;
          background: rgba(255, 255, 255, 0.16);
          border-radius: 4px;
        }
        .web-hero {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
        }
        .hero-bar-1 {
          width: 240px;
          height: 24px;
          background: #ffffff;
          border-radius: 6px;
        }
        .hero-bar-2 {
          width: 300px;
          height: 10px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
        }
        .hero-bar-3 {
          width: 220px;
          height: 10px;
          background: rgba(255, 255, 255, 0.18);
          border-radius: 4px;
        }
        .hero-cta {
          width: 100px;
          height: 32px;
          background: linear-gradient(90deg, #6366f1, #a855f7);
          border-radius: 7px;
          margin-top: 6px;
        }
        .web-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          margin-top: 14px;
        }
        .grid-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 16px;
          height: 120px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .card-media {
          width: 100%;
          height: 48px;
          background: rgba(56, 189, 248, 0.12);
          border-radius: 6px;
        }
        .card-line {
          width: 85%;
          height: 8px;
          background: rgba(255, 255, 255, 0.22);
          border-radius: 3px;
        }

        /* AUTO LAYOUT BLUEPRINT TAGS */
        .al-badge {
          position: absolute;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          padding: 4px 10px;
          border-radius: 6px;
          z-index: 5;
          letter-spacing: 0.04em;
        }
        .al-badge-1 {
          top: 105px;
          left: 45px;
          background: #0284c7;
          box-shadow: 0 4px 14px rgba(2, 132, 199, 0.65);
        }
        .al-badge-2 {
          bottom: 190px;
          left: 200px;
          background: #db2777;
          box-shadow: 0 4px 14px rgba(219, 39, 119, 0.65);
        }

        /* FOREGROUND REAL PLUGIN WINDOW */
        .plugin-frame {
          position: absolute;
          right: 25px;
          top: 50%;
          transform: translateY(-50%) perspective(1200px) rotateY(-4deg) rotateX(1deg);
          z-index: 10;
          border-radius: 18px;
          padding: 3px;
          background: linear-gradient(145deg, rgba(192, 132, 252, 0.75) 0%, rgba(56, 189, 248, 0.5) 50%, rgba(236, 72, 153, 0.5) 100%);
          box-shadow: 
            0 35px 80px -15px rgba(0, 0, 0, 0.95),
            0 0 50px rgba(168, 85, 247, 0.4);
        }
        .plugin-image {
          display: block;
          height: 760px;
          width: auto;
          border-radius: 15px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
        }

        /* FLOATING MICRO BADGES */
        .glass-pill {
          position: absolute;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 20px;
          background: rgba(15, 23, 42, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(18px);
          border-radius: 14px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.75);
          font-size: 13.5px;
          font-weight: 700;
        }
        .pill-top-right {
          top: 35px;
          right: 15px;
          color: #38bdf8;
          border-color: rgba(56, 189, 248, 0.45);
        }
        .pill-bottom-left {
          bottom: 30px;
          left: 100px;
          color: #34d399;
          border-color: rgba(52, 211, 153, 0.45);
        }
      </style>
    </head>
    <body>
      <div class="ambient-glow-1"></div>
      <div class="ambient-glow-2"></div>
      <div class="ambient-glow-3"></div>
      <div class="bg-grid"></div>

      <div class="layout-root">
        <!-- LEFT COLUMN -->
        <div class="left-content">
          <div class="category-pill">
            <span class="sparkle">✦</span>
            <span class="label">Official Figma Plugin & Chrome Extension</span>
          </div>

          <h1 class="hero-title">
            HTML To<br>
            <span class="title-gradient">Perfect Figma</span>
          </h1>

          <p class="hero-description">
            Turn any live website into clean, fully editable native Figma layers with real Auto Layout in seconds.
          </p>

          <div class="features-grid">
            <div class="feature-card">
              <div class="feature-icon icon-blue">⚡</div>
              <div class="feature-info">
                <h4>Native Auto Layout</h4>
                <p>Flexbox & Grid converted</p>
              </div>
            </div>

            <div class="feature-card">
              <div class="feature-icon icon-purple">🔤</div>
              <div class="feature-info">
                <h4>Editable Typography</h4>
                <p>Real fonts, weights & styles</p>
              </div>
            </div>

            <div class="feature-card">
              <div class="feature-icon icon-pink">🎨</div>
              <div class="feature-info">
                <h4>Vector SVGs & Assets</h4>
                <p>Crisp paths & image fills</p>
              </div>
            </div>

            <div class="feature-card">
              <div class="feature-icon icon-emerald">🪄</div>
              <div class="feature-info">
                <h4>Ultimate Tools</h4>
                <p>Text Ipsumed & Assets Diary</p>
              </div>
            </div>
          </div>

          <div class="badges-footer">
            <div class="badge-pill-free">✓ 8 Free Exports to Start</div>
            <div class="badge-pill-pro">✦ Lifetime Pro: Pay Once, Keep Forever</div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="right-showcase">
          <div class="showcase-stage">
            <div class="stage-glow"></div>

            <!-- Auto Layout Badges -->
            <div class="al-badge al-badge-1">Auto Layout: Flex Row</div>
            <div class="al-badge al-badge-2">Grid: 2 Columns (Gap: 14px)</div>

            <!-- Webpage Mockup Behind -->
            <div class="browser-mock">
              <div class="browser-header">
                <div class="browser-traffic">
                  <div class="traffic-dot t-red"></div>
                  <div class="traffic-dot t-yellow"></div>
                  <div class="traffic-dot t-green"></div>
                </div>
                <div class="browser-address">https://stripe.com</div>
              </div>
              <div class="browser-body">
                <div class="web-nav">
                  <div class="nav-logo"></div>
                  <div class="nav-links">
                    <div class="nav-link-pill"></div>
                    <div class="nav-link-pill"></div>
                    <div class="nav-link-pill"></div>
                  </div>
                </div>
                <div class="web-hero">
                  <div class="hero-bar-1"></div>
                  <div class="hero-bar-2"></div>
                  <div class="hero-bar-3"></div>
                  <div class="hero-cta"></div>
                </div>
                <div class="web-grid">
                  <div class="grid-card">
                    <div class="card-media"></div>
                    <div class="card-line"></div>
                  </div>
                  <div class="grid-card">
                    <div class="card-media"></div>
                    <div class="card-line"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Floating Micro Badges -->
            <div class="glass-pill pill-top-right">
              <span>⚡ 1-Click Browser Capture</span>
            </div>
            <div class="glass-pill pill-bottom-left">
              <span>📐 100% Native Figma Hierarchy</span>
            </div>

            <!-- Real User Plugin Window -->
            <div class="plugin-frame">
              <img class="plugin-image" src="data:image/png;base64,${base64UserUi}" />
            </div>

          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(html, { waitUntil: 'networkidle0' });
  const opt2Path = 'c:/h2F/dist/store-assets/figma_thumbnail_1920x1080_ui_cover.png';
  await page.screenshot({ path: opt2Path, type: 'png' });
  console.log('Saved perfected UI cover thumbnail to:', opt2Path);

  // Update primary file
  fs.copyFileSync(opt2Path, 'c:/h2F/dist/store-assets/figma_thumbnail_1920x1080.png');
  console.log('Updated c:/h2F/dist/store-assets/figma_thumbnail_1920x1080.png successfully!');

  await browser.close();
}

renderThumbnails().catch(err => {
  console.error('Render error:', err);
  process.exit(1);
});
