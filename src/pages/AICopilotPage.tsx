import { useState } from 'react';
import { Sparkles, Send, Bot, User, HelpCircle, Terminal } from 'lucide-react';
import { soundFx } from '../utils/audio';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  citation?: string;
  formula?: string;
}

const PRESET_QUESTIONS = [
  'Why was Block BLK-0881 scheduled at 01:30 AM?',
  'What is the ARCI score for KM 142.4 rail defect?',
  'What happens if we separate Track and OHE into 2 blocks?',
  'Explain the 10-Week Notice rule for the 26-Week RBP.',
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'assistant',
    text: 'Namaste. I am SAMANVAY AI Copilot (समन्वय एआई सह-चालक), an operational reasoning assistant calibrated to Indian Railways Working Time Tables (WTT), JPO Section 42 rules, and multi-departmental co-location constraints. How can I assist your corridor operations today?',
    timestamp: '21:55 IST',
  },
  {
    id: 'msg-2',
    sender: 'user',
    text: 'Why was Block BLK-0881 scheduled at 01:30 AM instead of daytime?',
    timestamp: '21:56 IST',
  },
  {
    id: 'msg-3',
    sender: 'assistant',
    text: 'Block BLK-0881 (KRJ–SOM, UP Line) was scheduled at 01:30–04:30 IST based on Pareto-optimal multi-objective Simulated Annealing:\n\n1. **Zero High-Yield Path Conflict**: 0 passenger train paths (Vande Bharat 22436, Rajdhani 12424) run between 01:15 and 04:45 IST on this chord.\n2. **Headway Margin**: Post-passage of freight BOXNHL 602 at 01:12, a continuous 198-minute headway valley exists, fulfilling the requested 180-minute requirement with a 18-minute buffer.\n3. **Co-location Efficiency**: Engineering (CSM 922 tamping) and Electrical TRD (catenary wire replacement) require simultaneous 25 kV power shutdown. Bundling them at 01:30 avoids a separate 3-hour daytime shutdown, preserving 14 freight paths.',
    timestamp: '21:56 IST',
    citation: 'Section 42 JPO & WTT Table 4B',
    formula: 'Cost = w_delay(0) + w_downtime(180) - w_coloc(5000) = Minimum',
  },
];

export default function AICopilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal] = useState('');

  const handleSend = (textToSend?: string) => {
    const q = textToSend || inputVal;
    if (!q.trim()) return;

    soundFx.playClick();
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: new Date().toTimeString().slice(0, 5) + ' IST',
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputVal('');

    // Generate intelligent contextual response
    setTimeout(() => {
      soundFx.playSuccess();
      let replyText = '';
      let citation = '';
      let formula = '';

      if (q.toLowerCase().includes('142.4') || q.toLowerCase().includes('arci')) {
        replyText =
          'Defect FLAW-NCR-092 at KM 142.4 UP rail exhibits an ARCI Risk Score of 0.96 (IMR Immediate Removal):\n\n' +
          '• **P_f (Weibull Probability)**: 0.92 based on cumulative GMT (38.4 MGT on 60kg 90UTS rail) and ultrasonic signal amplitude.\n' +
          '• **ODI (Operational Disruption Index)**: 0.88 due to high axle loads and 130 km/h passenger corridor ranking.\n' +
          '• **O_due (Days Overdue)**: 0.95 (14 days past recommended 48-hour jogoggled clamp window).\n' +
          '• **TSR Uplift Penalty**: +0.15 added due to active 30 km/h speed restriction slowing 42 trains/day.';
        citation = 'TMS USFD Manual Appendix VII & SAMANVAY ARCI Engine';
        formula = 'ARCI = sqrt(1.0) * (0.30*0.92 + 0.25*0.88 + 0.25*0.95 + 0.20*0.78) + 0.15 = 0.96';
      } else if (q.toLowerCase().includes('separate') || q.toLowerCase().includes('co-location')) {
        replyText =
          'Separating Track and OHE into 2 independent maintenance windows would result in severe network degradation:\n\n' +
          '• **Total Line Closures**: Increases from 22 to 32 shutdowns (+45.4% disruptive blocks).\n' +
          '• **Freight Delay**: +18.5 freight train delay hours added, costing ₹3,42,250 in demurrage.\n' +
          '• **TSR Drag**: 2 separate speed restrictions would remain active for 6 additional days.\n' +
          '• Recommendation: Maintain co-location as mandated under Joint Procedure Order 2026.';
        citation = 'Joint Concurrence JPO Section 6.2';
        formula = 'Co-location Savings = 18.5 hrs * ₹18,500/hr = ₹3,42,250';
      } else if (q.toLowerCase().includes('notice') || q.toLowerCase().includes('26-week') || q.toLowerCase().includes('rbp')) {
        replyText =
          'Under the 26-Week Rolling Block Programme (RBP) statutory framework:\n\n' +
          '• **Weeks 1 to 10 (Locked Execution Horizon)**: Any block requiring heavy machine deployment (TRT, PQRS, 140T Crane) must be locked 10 weeks prior to enable inter-divisional loco and crew rostering.\n' +
          '• **Notice Shortfall Alert**: If an unpredicted block is requested within Week 1–10 without GM/PCOM emergency exemption, SAMANVAY flags a NOTICE_SHORTFALL violation.\n' +
          '• **Weeks 11 to 26 (Strategic Planning Horizon)**: Machine rosters remain dynamically swappable based on updated ARCI risk assessments.';
        citation = 'Railway Board Master Circular on Rolling Block Programme (2024/Co-ord/RBP)';
      } else {
        replyText = `Based on SAMANVAY corridor telemetry for "${q}": The system evaluates WTT train graphs, real-time TMS track geometry, and 25 kV traction feeding to guarantee optimal asset availability without delaying Mail/Express trains. All decisions are cryptographically logged in the BDMS hand-off ledger.`;
        citation = 'SAMANVAY Multi-Horizon Engine';
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: replyText,
        timestamp: new Date().toTimeString().slice(0, 5) + ' IST',
        citation,
        formula,
      };

      setMessages((prev) => [...prev, botMsg]);
    }, 600);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1440px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* Editorial Header */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 28px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-dark-olive)',
            color: 'var(--color-warm-stone)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Sparkles size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                AI Copilot Desk &bull; एआई सह-चालक
              </h1>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: 'var(--radius-pill)',
                background: 'rgba(75, 101, 92, 0.3)',
                color: 'var(--color-warm-stone)',
                border: '1px solid var(--color-forest-green)'
              }}>
                [?] Module 15
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.86rem', color: 'rgba(255,255,255,0.7)' }}>
              Deterministic operational intelligence assistant providing mathematical explanations of ARCI risk scores, WTT headway gaps, and co-location trade-offs.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.76rem',
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'rgba(52, 57, 39, 0.8)',
            color: 'var(--color-warm-stone)',
            border: '1px solid var(--color-border)'
          }}>
            REASONING MODEL: DETERMINISTIC &bull; SIL-4
          </span>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="card--editorial" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '600px' }}>
        
        {/* Preset Query Chips */}
        <div>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Suggested Corridor Inquiries:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {PRESET_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                style={{
                  background: '#F8FAF6',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  color: '#333',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <HelpCircle size={13} color="var(--color-forest-green)" />
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Message Thread */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflowY: 'auto',
          padding: '12px 0',
          borderTop: '1px solid #E5E9E2',
          borderBottom: '1px solid #E5E9E2'
        }}>
          {messages.map((msg) => {
            const isBot = msg.sender === 'assistant';
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignSelf: isBot ? 'flex-start' : 'flex-end',
                  maxWidth: isBot ? '85%' : '75%',
                }}
              >
                {isBot && (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-dark-olive)',
                    color: 'var(--color-warm-stone)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Bot size={18} />
                  </div>
                )}

                <div style={{
                  background: isBot ? '#F8FAF6' : 'var(--color-dark-olive)',
                  color: isBot ? '#111614' : '#FFFFFF',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 18px',
                  border: `1px solid ${isBot ? 'var(--color-border)' : 'var(--color-dark-olive)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '0.86rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {msg.text}
                  </div>

                  {msg.formula && (
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.74rem',
                      background: 'rgba(0,0,0,0.06)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-forest-green)',
                      fontWeight: 600,
                      borderLeft: '3px solid var(--color-forest-green)'
                    }}>
                      {msg.formula}
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.7rem',
                    color: isBot ? '#888' : 'rgba(255,255,255,0.7)',
                    marginTop: '2px'
                  }}>
                    <span>{msg.timestamp}</span>
                    {msg.citation && (
                      <span style={{ fontStyle: 'italic', color: 'var(--color-forest-green)', fontWeight: 600 }}>
                        &bull; {msg.citation}
                      </span>
                    )}
                  </div>
                </div>

                {!isBot && (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-forest-green)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <User size={18} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Input Bar */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{
            flex: 1,
            background: '#F8FAF6',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Terminal size={16} color="#888" />
            <input
              type="text"
              placeholder="Ask a question about train graphs, ARCI risks, or JPO co-location..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                width: '100%',
                fontSize: '0.86rem',
                color: '#111614'
              }}
            />
          </div>

          <button
            onClick={() => handleSend()}
            className="btn--forest"
            style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem' }}
          >
            <span>Inquire</span>
            <Send size={15} />
          </button>
        </div>

      </div>

    </div>
  );
}
