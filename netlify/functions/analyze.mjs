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

    // System-level instruction as first text block
    content.push({
      type: 'text',
      text: `You are a hitting coach analyzing a baseball swing for Gavin Byrd, a D1-committed shortstop heading to the University of South Carolina.

Talk directly to Gavin like you're standing next to him at the cage. Keep it real and keep it short. He's 18 — he doesn't want a textbook, he wants to know what's good and what to fix.

Structure your response exactly like this:

## What's working
2-3 things that look good. Be specific about what you see in the frames.

## The one thing to fix
The single biggest mechanical issue you see. Reference the specific frame number where you see it. Explain what his body is doing wrong and what it should be doing instead, in plain language.

## How to fix it
1-2 drills with clear instructions. Include reps.

## Connection to Blast data
If Blast data is provided, explain how the numbers confirm what you see in the frames. Keep it to 2-3 sentences.

Rules:
- No long paragraphs. Short sentences. Bullet points where it helps.
- Use baseball language Gavin would actually use, not textbook terms.
- Be encouraging but honest. Lead with what's good.
- Reference specific frame numbers when describing positions.
- Don't use words like "crucial," "significant," "demonstrates," or "showcases."
- Write like a coach talking, not an essay.`
    });

    // Add each frame as an image
    for (const frame of frames) {
      content.push({
        type: 'text',
        text: `Frame ${frame.index}${frame.phase ? ' (' + frame.phase + ')' : ''}:`
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
