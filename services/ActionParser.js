'use strict';

/**
 * ActionParser — extracts structured actions from AI responses.
 *
 * Input: raw AI response string
 * Output: { actions: Array, text: string }
 *
 * Supported actions:
 *   <action type="send_gallery">
 *     <count>N</count>
 *     <caption>...</caption>
 *   </action>
 *
 * Only send_gallery is implemented. Unknown actions are ignored
 * and left in the text.
 */
class ActionParser {
  /**
   * Parse AI response for action blocks.
   * @param {string} raw - Raw AI response text
   * @returns {{ actions: Array, text: string }}
   */
  static parse(raw) {
    if (!raw) return { actions: [], text: raw || '' };

    const actions = [];
    let text = raw;

    // Match: <action type="send_gallery">...</action>
    const actionRegex = /<action\s+type="([^"]+)"\s*>([\s\S]*?)<\/action>/g;
    let match;

    while ((match = actionRegex.exec(raw)) !== null) {
      const type = match[1];
      const body = match[2];

      if (type === 'send_gallery') {
        const countMatch = body.match(/<count>\s*(\d+)\s*<\/count>/);
        const captionMatch = body.match(/<caption>([\s\S]*?)<\/caption>/);

        actions.push({
          type: 'send_gallery',
          count: countMatch ? parseInt(countMatch[1], 10) : 5,
          caption: captionMatch ? captionMatch[1].trim() : ''
        });
      } else if (type === 'send_marketplace_url') {
        const messageMatch = body.match(/<message>([\s\S]*?)<\/message>/);

        actions.push({
          type: 'send_marketplace_url',
          message: messageMatch ? messageMatch[1].trim() : ''
        });
      }

      // Remove the action block from text
      text = text.replace(match[0], '').trim();
    }

    return { actions, text };
  }
}

module.exports = ActionParser;
