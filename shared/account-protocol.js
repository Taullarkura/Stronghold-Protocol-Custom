// The account (Worker) line was retired on 2026-10-18, together with its password / nickname / discriminator rules. What
// remains is how a display name is split for components.js PlayerName: a nickname and the '#NNNN' discriminator an
// account-era record may still hold.

/**
 * A display name's parts: { nickname, tag: '#NNNN' } for an account's; any other name is all nickname (tag '').
 * @param {string} name
 * @returns {{nickname: string, tag: string}}
 */
export function nameParts(name) {
  const tag = /#\d{4}$/.exec(name)?.[0] ?? '';
  return { nickname: name.slice(0, name.length - tag.length), tag };
}
