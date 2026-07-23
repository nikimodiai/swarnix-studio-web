// ── Poster canvas rendering ───────────────────────────────────────────
// Draws a 1080×1350 (4:5) branded poster to an offscreen <canvas> and returns
// it as a JPEG blob — the web equivalent of the mobile app's view-shot
// capture of a native poster component. Used by both the Daily Gold Rate
// poster and the Festival/Occasion poster templates so they share one
// rendering path (background theme + header/footer are parameterised).

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

const GOLD = '#D9B75F';
const GOLD_SOFT = '#E9D9A8';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Render the Daily Gold Rate poster. `branding`: { storeName, storePhone,
 * storeLogoUrl }. `rates`: DailyRates from lib/rates.js.
 * Returns a Blob (image/jpeg).
 */
export async function renderRatePoster({ date, isToday, rates, branding, formatInr, formatRateDate }) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');

  // Backdrop
  const grad = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  grad.addColorStop(0, '#211B12');
  grad.addColorStop(0.5, '#1A1611');
  grad.addColorStop(1, '#0E0B07');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  const padX = 80;
  let y = 84;

  // Header: logo + store name/phone
  const storeName = branding?.storeName?.trim() || 'Your Jewellery Store';
  const storePhone = branding?.storePhone?.trim();
  const logoSize = 132;
  let textX = padX;

  if (branding?.storeLogoUrl) {
    try {
      const img = await loadImage(branding.storeLogoUrl);
      ctx.save();
      roundRect(ctx, padX, y, logoSize, logoSize, 20);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(padX, y, logoSize, logoSize);
      const scale = Math.max(logoSize / img.width, logoSize / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, padX + (logoSize - dw) / 2, y + (logoSize - dh) / 2, dw, dh);
      ctx.restore();
      textX = padX + logoSize + 32;
    } catch {
      // Logo failed to load (e.g. CORS) — skip it, still render text.
    }
  }

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#F4F0E8';
  ctx.font = "700 58px Georgia, 'Times New Roman', serif";
  const nameLines = wrapText(ctx, storeName, POSTER_WIDTH - textX - padX);
  nameLines.slice(0, 2).forEach((line, i) => ctx.fillText(line, textX, y + i * 66));
  if (storePhone) {
    ctx.fillStyle = GOLD_SOFT;
    ctx.font = "400 30px 'Segoe UI', sans-serif";
    ctx.fillText(storePhone, textX, y + nameLines.length * 66 + 8);
  }

  y += logoSize + 44;
  ctx.strokeStyle = 'rgba(217,183,95,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(POSTER_WIDTH - padX, y); ctx.stroke();
  y += 40;

  ctx.fillStyle = GOLD;
  ctx.font = "700 40px 'Segoe UI', sans-serif";
  ctx.fillText('आज का भाव', padX, y);
  y += 56;
  ctx.fillStyle = '#F4F0E8';
  ctx.font = "400 46px Georgia, 'Times New Roman', serif";
  ctx.fillText("Today's Gold & Silver Rate", padX, y);
  y += 54;
  ctx.fillStyle = '#B8AE9C';
  ctx.font = "400 30px 'Segoe UI', sans-serif";
  ctx.fillText(formatRateDate(date) + (isToday ? '' : ' · last known rate'), padX, y);
  y += 60;

  // Rate rows
  const rowH = 128, rowGap = 22, rowW = POSTER_WIDTH - padX * 2;
  for (const r of rates) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, padX, y, rowW, rowH, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(217,183,95,0.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, padX, y, rowW, rowH, 24);
    ctx.stroke();

    ctx.fillStyle = '#F4F0E8';
    ctx.font = "700 48px Georgia, 'Times New Roman', serif";
    ctx.fillText(r.label, padX + 44, y + 26);
    ctx.fillStyle = '#9A917F';
    ctx.font = "400 26px 'Segoe UI', sans-serif";
    ctx.fillText(r.caption, padX + 44, y + 84);

    const priceText = `₹${formatInr(r.isSilver ? r.per10g : r.perGram)}`;
    const perText = r.isSilver ? 'per kg' : `per gram · ₹${formatInr(r.per10g)}/10g`;
    ctx.textAlign = 'right';
    ctx.fillStyle = GOLD;
    ctx.font = "700 56px Georgia, 'Times New Roman', serif";
    ctx.fillText(priceText, POSTER_WIDTH - padX - 44, y + 20);
    ctx.fillStyle = '#B8AE9C';
    ctx.font = "400 26px 'Segoe UI', sans-serif";
    ctx.fillText(perText, POSTER_WIDTH - padX - 44, y + 84);
    ctx.textAlign = 'left';

    y += rowH + rowGap;
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8A8175';
  ctx.font = "400 24px 'Segoe UI', sans-serif";
  ctx.fillText('Rate excl. GST & making charges · Source: IBJA', POSTER_WIDTH / 2, POSTER_HEIGHT - 96);
  ctx.fillStyle = GOLD_SOFT;
  ctx.font = "400 26px 'Segoe UI', sans-serif";
  ctx.fillText('Made with Swarnix Studio', POSTER_WIDTH / 2, POSTER_HEIGHT - 62);
  ctx.textAlign = 'left';

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95));
}

/**
 * Render a festival/occasion poster: either a theme gradient background, or
 * a jeweller-uploaded photo (cover-fit, with a dark scrim so the greeting
 * text stays readable) — plus greeting text and optional store branding
 * footer. `theme`: { bg: [c1, c2], accent }. `backgroundImageUrl`: optional
 * uploaded/camera/library photo to use as the backdrop instead of the theme.
 * `textPosition`: 'middle' (default) or 'bottom' — lets the jeweller move
 * the greeting text off the center of the photo (e.g. a model's face or a
 * jewellery piece) down to a clear strip near the footer instead.
 */
export async function renderFestivalPoster({
  theme, greeting, subtext, branding, backgroundImageUrl, textPosition = 'middle',
}) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');

  let usedPhotoBackground = false;
  if (backgroundImageUrl) {
    try {
      const img = await loadImage(backgroundImageUrl);
      const scale = Math.max(POSTER_WIDTH / img.width, POSTER_HEIGHT / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (POSTER_WIDTH - dw) / 2, (POSTER_HEIGHT - dh) / 2, dw, dh);
      usedPhotoBackground = true;
    } catch {
      // Photo failed to load (e.g. CORS) — fall through to the theme gradient.
    }
  }

  if (!usedPhotoBackground) {
    const grad = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    grad.addColorStop(0, theme.bg[0]);
    grad.addColorStop(1, theme.bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

    // Decorative corner glow — theme backgrounds only; a photo backdrop
    // already has its own visual interest.
    const glow = ctx.createRadialGradient(POSTER_WIDTH * 0.85, 140, 20, POSTER_WIDTH * 0.85, 140, 420);
    glow.addColorStop(0, `${theme.accent}55`);
    glow.addColorStop(1, `${theme.accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  } else {
    // Dark scrim over the photo so white greeting text and the footer stay
    // legible regardless of how bright/busy the uploaded photo is. The band
    // is concentrated behind wherever the greeting text will actually sit
    // (middle third vs. lower third) rather than a fixed gradient, so
    // whichever textPosition is chosen gets proper contrast — not just
    // whatever happened to line up with the old fixed top/bottom fade.
    const scrim = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
    if (textPosition === 'bottom') {
      scrim.addColorStop(0, 'rgba(0,0,0,0.12)');
      scrim.addColorStop(0.55, 'rgba(0,0,0,0.12)');
      scrim.addColorStop(0.68, 'rgba(0,0,0,0.55)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.78)');
    } else {
      scrim.addColorStop(0, 'rgba(0,0,0,0.25)');
      scrim.addColorStop(0.32, 'rgba(0,0,0,0.55)');
      scrim.addColorStop(0.62, 'rgba(0,0,0,0.55)');
      scrim.addColorStop(0.78, 'rgba(0,0,0,0.25)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.6)');
    }
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  }

  const padX = 90;

  // Logo (top-left, small)
  let y = 90;
  if (branding?.storeLogoUrl) {
    try {
      const img = await loadImage(branding.storeLogoUrl);
      const size = 96;
      ctx.save();
      roundRect(ctx, padX, y, size, size, 18);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(padX, y, size, size);
      const scale = Math.max(size / img.width, size / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, padX + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
      ctx.restore();
    } catch { /* skip */ }
  }

  // Greeting — placed either vertically centered, or down in a clear band
  // near the bottom (above the store-identity footer) so it doesn't sit on
  // top of a face or the jewellery itself in an uploaded photo.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = "700 88px Georgia, 'Times New Roman', serif";
  const lines = wrapText(ctx, greeting, POSTER_WIDTH - padX * 2);
  const lineH = 100;
  const blockH = lines.length * lineH;

  let gy, subtextY;
  if (textPosition === 'bottom') {
    // Work backwards from the footer block (store name starts at
    // POSTER_HEIGHT - 160) so the greeting+subtext band always clears it
    // with real breathing room, regardless of how many lines wrap or
    // whether there's a subtext line at all. Computed directly rather than
    // via the draw loop's `lineH` stride, since lineH (100, sized for the
    // 88px greeting font) is much larger than the actual gap the smaller
    // subtext line needs.
    // textBaseline is 'top', so a fillText at y occupies roughly
    // [y, y + fontSize] — account for that when stacking bottom-up.
    const greetingFontSize = 88;
    const subtextFontSize = 38;
    const footerTopY = POSTER_HEIGHT - 160;
    const bandGap = 55;    // gap between the last text line's bottom and the footer
    const subtextGap = 20; // gap between the greeting's bottom and the subtext's top
    subtextY = footerTopY - bandGap - subtextFontSize;
    const lastGreetingLineY = subtext
      ? subtextY - subtextGap - greetingFontSize
      : footerTopY - bandGap - greetingFontSize;
    gy = lastGreetingLineY - (lines.length - 1) * lineH;
  } else {
    gy = (POSTER_HEIGHT - blockH) / 2 - 60;
  }
  lines.forEach((line) => { ctx.fillText(line, POSTER_WIDTH / 2, gy); gy += lineH; });

  if (subtext) {
    ctx.font = "400 38px 'Segoe UI', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(subtext, POSTER_WIDTH / 2, textPosition === 'bottom' ? subtextY : gy + 20);
  }

  // Footer: store identity
  const storeName = branding?.storeName?.trim();
  const storePhone = branding?.storePhone?.trim();
  ctx.font = "700 40px Georgia, 'Times New Roman', serif";
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(storeName || 'Your Jewellery Store', POSTER_WIDTH / 2, POSTER_HEIGHT - 160);
  if (storePhone) {
    ctx.font = "400 28px 'Segoe UI', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(storePhone, POSTER_WIDTH / 2, POSTER_HEIGHT - 112);
  }
  ctx.font = "400 22px 'Segoe UI', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Made with Swarnix Studio', POSTER_WIDTH / 2, POSTER_HEIGHT - 60);
  ctx.textAlign = 'left';

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95));
}
