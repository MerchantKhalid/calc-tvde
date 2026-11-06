import { useState, useMemo, useEffect, useRef } from 'react';
import { T } from './i18n.jsx';

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const STORE_KEY = 'tvde-calc-v1';

const eur = (n, decimals = 2) =>
  new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(isFinite(n) ? n : 0);

// accepts "12,5" or "12.5"
const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) || n < 0 ? 0 : n;
};

const WEEKS_PER_MONTH = 52 / 12;
const toWeekly = (amount, unit) =>
  unit === 'month' ? amount / WEEKS_PER_MONTH : amount;

const mkDefaults = () => [
  { id: 'fuel', icon: '⛽', amount: '150', unit: 'week' },
  { id: 'rent', icon: '🚘', amount: '250', unit: 'week' },
  { id: 'insurance', icon: '🛡️', amount: '120', unit: 'month' },
  { id: 'maint', icon: '🔧', amount: '60', unit: 'month' },
  { id: 'social', icon: '🏛️', amount: '', unit: 'month' },
  { id: 'other', icon: '📦', amount: '', unit: 'month' },
];

// the 6 standard expenses are always present; saved custom ones are kept
const initExpenses = (list) => {
  const saved = Array.isArray(list) ? list : [];
  const base = mkDefaults().map((d) => {
    const old = saved.find((x) => x.id === d.id && !x.custom);
    return old ? { ...d, amount: old.amount ?? d.amount, unit: old.unit || d.unit } : d;
  });
  return [...base, ...saved.filter((x) => x.custom)];
};

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
};

// select the old value when a field is tapped, so typing replaces it
const selectAll = (e) => {
  const el = e.target;
  setTimeout(() => el.select(), 0);
};

const pct = (r) => String(+(r * 100).toFixed(1));

/* ─────────────────────────────────────────
   SMALL COMPONENTS
───────────────────────────────────────── */
function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={`seg ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ExpenseRow({ row, t, onChange, onRemove }) {
  return (
    <div className="exp-row">
      <div className="exp-label">
        <span className="exp-icon">{row.icon}</span>
        {row.custom ? (
          <input
            className="exp-name"
            type="text"
            placeholder={t.expName}
            value={row.label}
            onChange={(e) => onChange({ ...row, label: e.target.value })}
          />
        ) : (
          t.exp[row.id]
        )}
      </div>
      <div className="exp-inputs">
        <div className="money">
          <span>€</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={row.amount}
            onFocus={selectAll}
            onChange={(e) => onChange({ ...row, amount: e.target.value })}
          />
        </div>
        <Segmented
          className="mini"
          value={row.unit}
          onChange={(unit) => onChange({ ...row, unit })}
          options={[
            { value: 'week', label: t.unitW },
            { value: 'month', label: t.unitM },
          ]}
        />
        {onRemove && (
          <button type="button" className="exp-del" aria-label={t.remove} onClick={onRemove}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/* count-up animation for numbers */
function useCountUp(value) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min((now - start) / 700, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const cur = from + (value - from) * ease;
      prev.current = cur;
      setShown(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

const COLORS = { keep: '#19ffa3', tax: '#ffc83d', exp: '#ff4fa3', bad: '#ff3b5c' };

/* One neon circle that tells the whole story:
   "You need to earn X  →  to keep Y"
   The ring is split into: keep / taxes / expenses */
function ResultCircle({ t, mode, gross, net, taxes, expenses, per }) {
  const gShown = useCountUp(gross);
  const nShown = useCountUp(net);

  const size = 220;
  const stroke = 13;
  const rad = (size - stroke) / 2 - 8;
  const circ = 2 * Math.PI * rad;
  const negative = net < 0;

  const parts = negative
    ? [{ key: 'bad', color: COLORS.bad, frac: 1 }]
    : [
        { key: 'keep', color: COLORS.keep, frac: gross > 0 ? net / gross : 0 },
        { key: 'tax', color: COLORS.tax, frac: gross > 0 ? taxes / gross : 0 },
        { key: 'exp', color: COLORS.exp, frac: gross > 0 ? expenses / gross : 0 },
      ].filter((x) => x.frac > 0.002);

  const gap = parts.length > 1 ? 5 : 0;
  let start = 0;
  const segs = parts.map((p) => {
    const len = Math.max(p.frac * circ - gap, 0.5);
    const seg = { ...p, len, start };
    start += p.frac * circ;
    return seg;
  });

  const arcs = (w) =>
    segs.map((sg) => (
      <circle
        key={sg.key}
        cx={size / 2}
        cy={size / 2}
        r={rad}
        fill="none"
        stroke={sg.color}
        strokeWidth={w}
        strokeDasharray={`${sg.len} ${circ}`}
        strokeDashoffset={-sg.start}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .8s ease, stroke-dashoffset .8s ease' }}
      />
    ));

  const goal = mode === 'goal';
  const glow = negative ? COLORS.bad : COLORS.keep;

  return (
    <div className="rc" style={{ '--neon': glow }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="rc-svg">
        <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="#16223d" strokeWidth={stroke} />
      </svg>
      <svg viewBox={`0 0 ${size} ${size}`} className="rc-svg rc-glow">
        {arcs(stroke + 9)}
      </svg>
      <svg viewBox={`0 0 ${size} ${size}`} className="rc-svg">
        {arcs(stroke)}
      </svg>

      <div className="rc-center">
        <div className="rc-tag">{goal ? t.needEarn : t.youEarn}</div>
        <div className={`rc-num ${goal ? 'answer' : 'given'}`}>{eur(gShown, 0)}</div>

        <div className="rc-arrow">↓ {goal ? t.toKeep : t.youKeep}</div>

        <div className={`rc-num ${goal ? 'given keep' : 'answer'}`}>{eur(nShown, 0)}</div>
        <div className="rc-per">{per}</div>
      </div>
    </div>
  );
}

function Line({ label, value, color, bold, minus }) {
  return (
    <div className={`line ${bold ? 'bold' : ''}`}>
      <span>{label}</span>
      <span style={{ color }}>
        {minus ? '− ' : ''}
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────
   MAIN APP
───────────────────────────────────────── */
export default function TVDECalc() {
  const saved = useRef(load()).current;
  const browserPt = (navigator.language || 'en').toLowerCase().startsWith('pt');

  const [lang, setLang] = useState(T[saved.lang] ? saved.lang : browserPt ? 'pt' : 'en');
  const [mode, setMode] = useState(saved.mode || 'goal'); // goal = "I want to keep X" | earn = "I earn X"
  const [view, setView] = useState(saved.view || 'week'); // week | month
  const [amount, setAmount] = useState(saved.amount ?? '900');
  const [expenses, setExpenses] = useState(initExpenses(saved.expenses));
  const [ivaMode, setIvaMode] = useState(saved.ivaMode || '6'); // none | 6 | 23 | custom
  const [ivaCustom, setIvaCustom] = useState(saved.ivaCustom || '');
  const [irs, setIrs] = useState(saved.irs || '');
  const [days, setDays] = useState(saved.days || 6);

  const t = T[lang];

  // remember the driver's numbers on this phone
  useEffect(() => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ lang, mode, view, amount, expenses, ivaMode, ivaCustom, irs, days })
      );
    } catch {
      /* storage blocked: app still works */
    }
  }, [lang, mode, view, amount, expenses, ivaMode, ivaCustom, irs, days]);

  // page language, title and description follow the chosen language
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.pageTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.pageDesc);
  }, [lang, t]);

  const updateRow = (row) =>
    setExpenses((list) => list.map((x) => (x.id === row.id ? row : x)));
  const removeRow = (id) => setExpenses((list) => list.filter((x) => x.id !== id));
  const addRow = () =>
    setExpenses((list) => [
      ...list,
      { id: 'c' + Date.now(), icon: '🧾', label: '', amount: '', unit: 'month', custom: true },
    ]);

  const reset = () => {
    if (!window.confirm(t.resetConfirm)) return;
    setMode('goal');
    setView('week');
    setAmount('900');
    setExpenses(mkDefaults());
    setIvaMode('6');
    setIvaCustom('');
    setIrs('');
    setDays(6);
  };

  const r = useMemo(() => {
    const m = view === 'week' ? 1 : WEEKS_PER_MONTH; // scale weekly → chosen view
    const ivaRate =
      ivaMode === 'none' ? 0 : ivaMode === 'custom' ? Math.min(num(ivaCustom), 99) / 100 : Number(ivaMode) / 100;
    const irsRate = Math.min(num(irs), 60) / 100;
    const factor = (1 - ivaRate) * (1 - irsRate); // share of gross left after taxes

    const lines = expenses
      .map((e) => ({
        id: e.id,
        label: e.custom ? e.label || t.expDefault : t.exp[e.id],
        value: toWeekly(num(e.amount), e.unit) * m,
      }))
      .filter((l) => l.value > 0);
    const fixed = lines.reduce((s, l) => s + l.value, 0);

    const input = num(amount);
    let gross, net;
    if (mode === 'goal') {
      net = input;
      gross = factor > 0 ? (net + fixed) / factor : 0;
    } else {
      gross = input;
      net = gross * factor - fixed;
    }
    const iva = gross * ivaRate;
    const irsAmt = (gross - iva) * irsRate;
    const weeklyDivisor = m * Math.max(days, 1);

    return {
      lines,
      fixed,
      gross,
      net,
      iva,
      ivaRate,
      irsAmt,
      irsRate,
      keptPct: gross > 0 ? (net / gross) * 100 : 0,
      grossPerDay: gross / weeklyDivisor,
      netPerDay: net / weeklyDivisor,
    };
  }, [mode, view, amount, expenses, ivaMode, ivaCustom, irs, days, t]);

  const word = view === 'week' ? t.weekW : t.monthW;
  const per = t.per(word);
  const negative = r.net < 0;
  const headline = mode === 'goal' ? r.gross : r.net;
  const taxes = r.iva + r.irsAmt;

  const share = () => {
    const f = mode === 'goal' ? t.shareGoal : t.shareEarn;
    const text = `${f(eur(mode === 'goal' ? r.net : r.gross, 0), eur(mode === 'goal' ? r.gross : r.net, 0), per)} ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <>
      <style>{CSS}</style>

      <div className="app">
        {/* ───── Header ───── */}
        <header>
          <Segmented
            className="lang"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'pt', label: 'PT' },
            ]}
          />
          <div className="badge">🚗 TVDE Portugal</div>
          <h1>{lang === 'pt' ? 'Calculadora TVDE' : 'TVDE Income Calculator'}</h1>
          <div className="by">
            {t.by} <b>Khalid Hasan</b> · BDCARS Fleet
          </div>
          <div className="trusted">{t.trusted}</div>
          <p>{t.tagline}</p>
        </header>

        {/* ───── Step 1 ───── */}
        <section className="card">
          <div className="step">{t.step1}</div>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'goal', label: t.goal },
              { value: 'earn', label: t.earn },
            ]}
          />

          <label className="big-label">{mode === 'goal' ? t.qGoal(word) : t.qEarn(word)}</label>
          <div className="money big">
            <span>€</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onFocus={selectAll}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'week', label: t.perWeek },
              { value: 'month', label: t.perMonth },
            ]}
          />
        </section>

        {/* ───── Step 2 ───── */}
        <section className="card">
          <div className="step">{t.step2}</div>
          <p className="hint">{t.hint2}</p>
          {expenses.filter((x) => !x.custom).map((row) => (
            <ExpenseRow key={row.id} row={row} t={t} onChange={updateRow} />
          ))}

          <div className="custom-title">{t.customTitle}</div>
          <p className="hint">{t.customHint}</p>
          {expenses.filter((x) => x.custom).map((row) => (
            <ExpenseRow key={row.id} row={row} t={t} onChange={updateRow} onRemove={() => removeRow(row.id)} />
          ))}
          <button type="button" className="add-exp" onClick={addRow}>
            {t.addExp}
          </button>
        </section>

        {/* ───── Step 3 ───── */}
        <section className="card">
          <div className="step">{t.step3}</div>

          <div className="tax-block">
            <div className="tax-title">{t.iva}</div>
            <div className="hint">{t.ivaHelp}</div>
            <Segmented
              className="iva-seg"
              value={ivaMode}
              onChange={setIvaMode}
              options={[
                { value: 'none', label: t.ivaNone },
                { value: '6', label: '6%' },
                { value: '23', label: '23%' },
                { value: 'custom', label: t.ivaCustom },
              ]}
            />
            {ivaMode === 'custom' && (
              <div className="tax-row custom-iva">
                <div className="hint">{t.ivaCustomLabel}</div>
                <div className="money small">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={ivaCustom}
                    onFocus={selectAll}
                    onChange={(e) => setIvaCustom(e.target.value)}
                  />
                  <span>%</span>
                </div>
              </div>
            )}
          </div>

          <div className="tax-row">
            <div>
              <div className="tax-title">{t.irs}</div>
              <div className="hint">{t.irsHelp}</div>
            </div>
            <div className="money small">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={irs}
                onFocus={selectAll}
                onChange={(e) => setIrs(e.target.value)}
              />
              <span>%</span>
            </div>
          </div>
        </section>

        {/* ───── Result ───── */}
        <section className={`card result ${negative ? 'neg' : ''}`}>
          <div className="step">{t.result}</div>

          <ResultCircle t={t} mode={mode} gross={r.gross} net={r.net} taxes={taxes} expenses={r.fixed} per={per} />

          {/* legend */}
          {!negative && r.gross > 0 && (
            <div className="legend">
              <span><i style={{ background: COLORS.keep }} />{t.lKeep(r.keptPct.toFixed(0))}</span>
              {taxes > 0 && (
                <span><i style={{ background: COLORS.tax }} />{t.lTax(((taxes / r.gross) * 100).toFixed(0))}</span>
              )}
              {r.fixed > 0 && (
                <span><i style={{ background: COLORS.exp }} />{t.lExp(((r.fixed / r.gross) * 100).toFixed(0))}</span>
              )}
            </div>
          )}

          {/* plain-language sentence */}
          <p className="sentence">
            {mode === 'goal'
              ? t.sGoal(eur(r.net, 0), eur(r.gross, 0), per)
              : t.sEarn(eur(r.gross, 0), eur(r.net, 0), per)}
          </p>

          {negative && <div className="warn">{t.warn}</div>}

          {/* per day */}
          <div className="perday">
            <div className="perday-top">
              <span>{t.days}</span>
              <div className="stepper">
                <button type="button" onClick={() => setDays((d) => Math.max(1, d - 1))}>−</button>
                <b>{days}</b>
                <button type="button" onClick={() => setDays((d) => Math.min(7, d + 1))}>+</button>
              </div>
            </div>
            <div className="perday-val">
              {mode === 'goal' ? t.dGoal(eur(r.grossPerDay)) : t.dEarn(eur(r.netPerDay))}
            </div>
          </div>

          <button type="button" className="share" onClick={share}>
            💬 {t.share}
          </button>

          {/* full breakdown, hidden until the driver wants it */}
          <details className="more">
            <summary>{t.breakdown}</summary>
            <div className="breakdown">
              <Line label={t.earned} value={eur(r.gross)} color="var(--green)" bold />
              {r.ivaRate > 0 && (
                <Line label={`${t.iva} ${pct(r.ivaRate)}%`} value={eur(r.iva)} color="var(--yellow)" minus />
              )}
              {r.irsRate > 0 && (
                <Line label={`IRS ${pct(r.irsRate)}%`} value={eur(r.irsAmt)} color="var(--red)" minus />
              )}
              {r.lines.map((l) => (
                <Line key={l.id} label={l.label} value={eur(l.value)} color="var(--muted)" minus />
              ))}
              <Line label={t.keep} value={eur(r.net)} color={negative ? 'var(--red)' : 'var(--green)'} bold />
            </div>
          </details>
        </section>

        <button type="button" className="reset" onClick={reset}>
          ↺ {t.reset}
        </button>

        <footer>
          {t.footer1}
          <br />
          {t.footer2}
        </footer>
      </div>

      {/* ───── Sticky summary ───── */}
      <div className="sticky">
        <div className="sticky-in">
          <span>{mode === 'goal' ? t.stNeed : t.stKeep} / {word}</span>
          <b style={{ color: negative ? 'var(--red)' : 'var(--green)' }}>{eur(headline, 0)}</b>
        </div>
      </div>
    </>
  );
}

const CSS = `
:root {
  --bg:#060911; --card:#0c1020; --surface:#111827; --border:#1a2540;
  --text:#eaf0fc; --muted:#8091b5;
  --green:#10b981; --red:#ef4444; --yellow:#f59e0b;
  --font:'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{-webkit-tap-highlight-color:transparent}
body{
  background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh;width:100%;
  background-image:radial-gradient(ellipse 80% 40% at 50% 0%,rgba(16,185,129,.08),transparent 60%);
}
#root{width:100%}
button,input,select{font-family:inherit}
button{cursor:pointer}

.app{max-width:480px;margin:0 auto;padding:0 1rem 7rem}

header{text-align:center;padding:1.6rem 0 1.2rem}
.badge{display:inline-block;font-size:.65rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;
  color:var(--green);background:rgba(16,185,129,.09);border:1.5px solid rgba(16,185,129,.22);
  padding:.3rem .9rem;border-radius:2rem;margin-bottom:.8rem}
h1{font-size:1.9rem;font-weight:800;letter-spacing:-.03em;
  background:linear-gradient(135deg,#fff 25%,#10b981 70%);-webkit-background-clip:text;
  -webkit-text-fill-color:transparent;background-clip:text}
.by{margin-top:.5rem;font-size:.85rem;color:var(--muted);font-weight:600}
.by b{color:var(--text);font-weight:800}
.trusted{display:inline-block;margin-top:.6rem;font-size:.7rem;font-weight:700;color:var(--yellow);
  background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);padding:.25rem .7rem;border-radius:2rem}
header p{color:var(--muted);font-size:.85rem;margin-top:.7rem}

.card{background:var(--card);border:1.5px solid var(--border);border-radius:1.2rem;
  padding:1.1rem;margin-bottom:1rem}
.step{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;
  color:var(--green);margin-bottom:.8rem}
.hint{font-size:.72rem;color:var(--muted);line-height:1.4}
.hint.center{text-align:center;margin-top:.3rem}

.seg{display:flex;background:var(--surface);border-radius:.7rem;padding:.2rem;gap:.2rem}
.seg button{flex:1;padding:.65rem .4rem;border:none;border-radius:.55rem;background:transparent;
  color:var(--muted);font-size:.8rem;font-weight:700;transition:all .18s}
.seg button.on{background:var(--green);color:#000;box-shadow:0 2px 10px rgba(16,185,129,.35)}

.big-label{display:block;margin:1.1rem 0 .5rem;font-size:.9rem;font-weight:700}
.money{display:flex;align-items:center;background:var(--surface);border:1.5px solid var(--border);
  border-radius:.7rem;overflow:hidden}
.money span{padding:0 .8rem;color:var(--muted);font-weight:700}
.money input{flex:1;min-width:0;background:transparent;border:none;outline:none;color:var(--text);
  font-weight:700;font-size:1rem;padding:.7rem .4rem}
.money:focus-within{border-color:var(--green)}
.money.big{margin-bottom:1rem}
.money.big input{font-size:1.8rem;padding:.6rem .4rem}
.money.big span{font-size:1.4rem}
.money.small{width:110px}
.money.small input{text-align:right;padding-right:0}

.exp-row{display:flex;justify-content:space-between;align-items:center;gap:.6rem;
  padding:.55rem 0;border-bottom:1px solid var(--border)}
.exp-row:last-child{border-bottom:none}
.exp-label{font-size:.85rem;font-weight:600;display:flex;align-items:center;gap:.5rem;min-width:0}
.exp-icon{font-size:1.1rem}
.exp-inputs{display:flex;gap:.4rem;flex-shrink:0}
.exp-inputs .money{width:92px}
.exp-inputs select{background:var(--surface);color:var(--text);border:1.5px solid var(--border);
  border-radius:.7rem;padding:0 .4rem;font-size:1rem;font-weight:600;outline:none}

.tax-row{display:flex;justify-content:space-between;align-items:center;gap:1rem;
  padding:.6rem 0;cursor:pointer}
.tax-row + .tax-row{border-top:1px solid var(--border);cursor:default}
.tax-title{font-size:.9rem;font-weight:700}
.toggle{width:46px;height:26px;border-radius:13px;background:var(--surface);
  border:2px solid var(--border);position:relative;transition:all .22s;flex-shrink:0}
.toggle div{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;
  background:#fff;transition:left .22s}
.toggle.on{background:var(--green);border-color:var(--green)}
.toggle.on div{left:20px}

.result{border-color:rgba(16,185,129,.35);background:linear-gradient(180deg,rgba(16,185,129,.06),var(--card))}
.result.neg{border-color:rgba(239,68,68,.4);background:linear-gradient(180deg,rgba(239,68,68,.07),var(--card))}

.rc{position:relative;width:min(80vw,290px);aspect-ratio:1;margin:.4rem auto .8rem}
.rc-svg{position:absolute;inset:0;width:100%;height:100%}
.rc-glow{filter:blur(9px);opacity:.8;animation:pulse 2.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.55}50%{opacity:.95}}
.rc-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;text-align:center;padding:0 16%;gap:.1rem}
.rc-tag{font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
.rc-num{font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1.1}
.rc-num.answer{font-size:clamp(1.9rem,10vw,2.6rem);color:#fff;
  text-shadow:0 0 8px var(--neon),0 0 22px var(--neon),0 0 40px var(--neon)}
.rc-num.given{font-size:clamp(1.1rem,5.5vw,1.45rem);color:var(--muted)}
.rc-num.given.keep{color:#19ffa3}
.rc-arrow{font-size:.68rem;font-weight:800;color:var(--muted);margin:.25rem 0 .1rem;
  padding:.1rem .6rem;border-top:1px solid var(--border);text-transform:uppercase;letter-spacing:.08em}
.rc-per{font-size:.72rem;font-weight:700;color:var(--neon);margin-top:.15rem}

.legend{display:flex;flex-wrap:wrap;justify-content:center;gap:.4rem .9rem;margin-bottom:.8rem;
  font-size:.74rem;font-weight:700;color:var(--muted)}
.legend span{display:flex;align-items:center;gap:.35rem}
.legend i{width:9px;height:9px;border-radius:50%;display:inline-block;box-shadow:0 0 8px currentColor}

.sentence{text-align:center;font-size:.95rem;line-height:1.5;color:var(--muted);margin:0 .2rem .9rem}
.sentence b{color:var(--text);font-weight:800}

.more{margin-top:1rem}
.more summary{cursor:pointer;list-style:none;text-align:center;font-size:.8rem;font-weight:700;
  color:var(--green);padding:.5rem}
.more summary::-webkit-details-marker{display:none}
.more summary::after{content:' ▾'}
.more[open] summary::after{content:' ▴'}

/* small phones */
@media (max-width:400px){
  .exp-row{flex-direction:column;align-items:stretch;gap:.4rem}
  .exp-inputs{width:100%}
  .exp-inputs .money{flex:1;width:auto}
  .exp-inputs select{width:110px}
}

.warn{margin-top:.8rem;padding:.6rem .8rem;border-radius:.7rem;font-size:.78rem;font-weight:600;
  color:var(--red);background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25)}

.breakdown{margin-top:.3rem;border-top:1px solid var(--border)}
.line{display:flex;justify-content:space-between;padding:.55rem 0;font-size:.82rem;
  color:var(--muted);border-bottom:1px solid var(--border);font-weight:600}
.line.bold{color:var(--text);font-weight:800;font-size:.9rem}

.perday{margin-top:1rem;background:var(--surface);border-radius:.9rem;padding:.9rem}
.perday-top{display:flex;justify-content:space-between;align-items:center;font-size:.8rem;font-weight:600}
.stepper{display:flex;align-items:center;gap:.7rem}
.stepper button{width:34px;height:34px;min-width:34px;padding:0;flex-shrink:0;display:flex;align-items:center;
  justify-content:center;border-radius:50%;border:1.5px solid var(--border);line-height:1;
  background:var(--card);color:var(--text);font-size:1.2rem;font-weight:700}
.stepper b{min-width:1rem;text-align:center}
.perday-val{margin-top:.7rem;text-align:center;font-size:1.05rem;font-weight:800}

footer{text-align:center;color:var(--muted);font-size:.65rem;line-height:1.7;margin-top:1rem}

.sticky{position:fixed;left:0;right:0;bottom:0;z-index:10;
  background:rgba(6,9,17,.92);backdrop-filter:blur(10px);border-top:1.5px solid var(--border);
  padding-bottom:env(safe-area-inset-bottom,0px)}
.sticky-in{max-width:480px;margin:0 auto;padding:.8rem 1rem;display:flex;
  justify-content:space-between;align-items:center;font-size:.8rem;font-weight:700;color:var(--muted)}
.sticky-in b{font-size:1.3rem;font-weight:800}

/* ── v2 additions ── */
header{position:relative}
.seg.lang{position:absolute;top:1rem;right:0;width:auto;padding:.15rem}
.seg.lang button{flex:none;min-height:36px;min-width:40px;padding:.3rem .6rem;font-size:.75rem}
.seg button{min-height:44px}
.seg.mini{flex-shrink:0}
.seg.mini button{min-height:44px;padding:.3rem .55rem;font-size:.72rem}
.money input{min-height:44px}
.money.small{width:120px}
.exp-inputs{align-items:stretch}
.exp-label{flex:1}
.exp-name{flex:1;min-width:0;background:var(--surface);border:1.5px solid var(--border);border-radius:.6rem;
  color:var(--text);font-size:.85rem;font-weight:600;padding:.5rem .6rem;min-height:44px;outline:none}
.exp-name:focus{border-color:var(--green)}
.exp-del{width:44px;min-width:44px;border:1.5px solid var(--border);border-radius:.7rem;background:var(--surface);
  color:var(--muted);font-size:1.3rem;line-height:1}
.exp-del:hover{color:var(--red);border-color:var(--red)}
.custom-title{margin-top:1.2rem;padding-top:1rem;border-top:1.5px solid var(--border);font-size:.9rem;font-weight:800}
.add-exp{width:100%;margin-top:.7rem;min-height:46px;border:1.5px dashed var(--border);border-radius:.7rem;
  background:transparent;color:var(--green);font-weight:700;font-size:.85rem}
.tax-block{padding:.4rem 0 .9rem;border-bottom:1px solid var(--border)}
.tax-block .hint{margin:.15rem 0 .7rem}
.tax-row{cursor:default}
.custom-iva{margin-top:.6rem;padding-bottom:0}
.stepper button{width:44px;height:44px;min-width:44px}
.share{width:100%;margin-top:1rem;min-height:48px;border:none;border-radius:.8rem;background:#25d366;
  color:#04210f;font-weight:800;font-size:.9rem}
.reset{display:block;margin:0 auto;min-height:44px;padding:0 1.2rem;border:none;background:transparent;
  color:var(--muted);font-size:.78rem;font-weight:700}
button:focus-visible,input:focus-visible{outline:2px solid var(--green);outline-offset:2px}
@media (max-width:400px){
  .exp-inputs{flex-wrap:nowrap}
  .exp-inputs .money{flex:1;width:auto}
  .exp-inputs select{display:none}
}
`;
