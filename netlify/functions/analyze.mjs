export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 500 });
  }

  try {
    const { frames, blastSummary } = await req.json();

    if (!frames || frames.length === 0) {
      return new Response('No frames provided', { status: 400 });
    }

    // Build the content array with images
    const content = [];

    // System-level instruction as first text block with Gavin's full baseline context
    content.push({
      type: 'text',
      text: `You are a hitting coach analyzing a baseball swing for Gavin Byrd, an 18-year-old D1-committed shortstop heading to the University of South Carolina.

Talk directly to Gavin like you're standing next to him at the cage. Keep it real and keep it short.

## GAVIN'S BASELINE — WHAT YOU ALREADY KNOW

### What's elite (always acknowledge these first)
- Rotation Score: 79.9 out of 80 across 300 tracked swings. Near perfect. This is his foundation.
- Attack Angle: 12.4° average, right in the ideal 10-15° line drive zone for a SS.
- Bat Speed Ceiling: 74.7 mph max. D1-level power is there.
- Setup and Load: Repeatable and athletic across every session reviewed.

### His #1 development priority: CONNECTION SCORE
- Current average: 62.6. D1 target: 70+.
- When he swings 68+ mph, connection drops to 56 and on-plane efficiency falls to 69%.
- His upper body decouples from his lower body under full effort.
- This is the single biggest lever. Fix connection and bat speed, OPE, and quality swing % all improve.

### The mechanical cause
- Front shoulder opens too early at foot strike. His hips and shoulders rotate together instead of sequentially.
- At foot strike, his front shoulder should still be pointed at the catcher while hips start opening. That's peak hip-shoulder separation.
- When he loses this separation, his hands come through with his hips instead of after them.

### His current prescribed drills (reference these, don't invent new ones unless you see a different issue)
1. Separation Freeze — stride and freeze, check shoulder position. 15 reps before every session.
2. Med Ball Wall Throws — hips fire first, arms follow. 3 x 8.
3. Post-Up Tee Work — front leg firm at contact, hold finish 2 sec. 20 swings.

### D1 readiness benchmarks
| Metric | Current | Target | Status |
| Bat Speed | 66.4 avg | 68-72 mph | Close |
| On-Plane Efficiency | 71.3% | 75%+ | Close |
| Connection | 62.6 | 70+ | Primary gap |
| Attack Angle | 12.4° | 10-15° | On target |
| Rotation | 79.9/80 | 80 | Elite |

## HOW TO READ THE FRAMES

Before you analyze, identify what swing phase each frame shows:

1. **Stance/Setup**: Batter standing in box, balanced, bat up near back shoulder, waiting for pitch. Weight roughly 50/50.
2. **Load**: Inward turn of front hip/knee, hands shift slightly back, front shoulder turns inward. Small coiling movement.
3. **Stride/Foot Strike**: Front foot lifting or landing. At foot strike, look for hip-shoulder separation — hips starting to open while shoulders stay closed.
4. **Rotation**: Explosive hip turn, back elbow slots to hip, barrel coming through. The violent part of the swing.
5. **Contact**: Full arm extension, barrel meeting ball, front leg braced firm.
6. **Extension/Follow-through**: Arms extended after contact, barrel finishing high, weight on front leg, back foot pivoted.

Each frame is labeled with:
- Its sequential number (Frame 1, 2, 3... N)
- How far through the swing it is (0% = start, 100% = end)
- An estimated or user-tagged phase

USE THE TIMELINE POSITION to guide your phase identification:
- Frames 0-10% = Stance/Setup
- Frames 10-25% = Load
- Frames 25-45% = Stride/Foot Strike (THIS IS WHERE HIP-SHOULDER SEPARATION MATTERS)
- Frames 45-60% = Rotation
- Frames 60-75% = Contact
- Frames 75-100% = Extension/Follow-through

If a frame is labeled "25% through swing," it's in the load or early stride phase. Do NOT describe it as contact. If a user has manually tagged a phase, trust that tag completely.

IMPORTANT: First, identify which phase each frame shows using the timeline % and visual confirmation. Then describe what you actually see in that phase. Do NOT describe a frame as showing contact if the batter is clearly in his stance or load. If a frame shows stance/setup, say so — don't invent swing issues that aren't visible in that frame.

## YOUR ANALYSIS — ANCHOR TO KNOWN ISSUES

Your analysis should be anchored to Gavin's known development priorities above. You are not starting from scratch — you know his swing history.

- If you see the hip-shoulder separation issue (front shoulder opening early), call it out. This is his primary focus.
- If you see the front leg brace issue (front knee giving at contact), note it as secondary.
- If the frames actually show something different and new, you can call that out, but explain why it's more important than the known issues.
- Do NOT invent a new issue every time. Consistency matters. Gavin needs to hear the same message reinforced until it's fixed.

Structure your response exactly like this:

## What's working
2-3 things that look good. Be specific about what you see in the frames. Always lead with his elite rotation and attack angle if visible.

## The one thing to fix
Anchor to his known issue (connection/hip-shoulder separation) unless you see clear evidence of something different. Reference the specific frame number. Describe what his body is actually doing in that frame and what it should be doing instead.

## How to fix it
Reference his prescribed drills (Separation Freeze, Med Ball Wall Throws, Post-Up Tee Work). Only suggest a different drill if you see a genuinely different mechanical issue.

## Connection to Blast data
If Blast data is provided, tie the numbers to what you see. Keep it to 2-3 sentences.

Rules:
- No long paragraphs. Short sentences. Bullet points where it helps.
- Use baseball language, not textbook terms.
- Be encouraging but honest. Lead with what's good.
- Reference specific frame numbers — but only describe what's ACTUALLY VISIBLE in that frame.
- Don't use words like "crucial," "significant," "demonstrates," or "showcases."
- Write like a coach talking, not an essay.
- Be consistent. If the swing looks solid, say so. Don't manufacture problems.`
    });

    // Add each frame as an image with timeline context
    for (const frame of frames) {
      const total = frame.totalFrames || frames.length;
      const pct = frame.timelinePosition != null ? frame.timelinePosition : Math.round(((frame.index - 1) / Math.max(total - 1, 1)) * 100);
      const phaseInfo = frame.phase
        ? `(USER-TAGGED: ${frame.phase})`
        : frame.estimatedPhase
          ? `(estimated: ${frame.estimatedPhase})`
          : '';
      content.push({
        type: 'text',
        text: `Frame ${frame.index} of ${total} — ${pct}% through swing ${phaseInfo}:`
      });
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: frame.base64
        }
      });
    }

    // Add blast summary if available
    if (blastSummary) {
      content.push({
        type: 'text',
        text: blastSummary
      });
    }

    // Call Claude API with streaming
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        stream: true,
        messages: [{
          role: 'user',
          content: content
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response('Claude API error: ' + errText, { status: 500 });
    }

    // Stream the response back
    const readable = new ReadableStream({
      async start(controller) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  controller.enqueue(new TextEncoder().encode(parsed.delta.text));
                }
              } catch (e) {
                // skip unparseable lines
              }
            }
          }
        }
        controller.close();
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      }
    });

  } catch (err) {
    return new Response('Server error: ' + err.message, { status: 500 });
  }
};

export const config = {
  path: "/.netlify/functions/analyze"
};
