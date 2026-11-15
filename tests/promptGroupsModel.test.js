import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePromptNameAndEmoji,
  sanitizeXmlTagName,
  createNewPromptEntry,
  createNewXmlGroupPair,
  buildPromptTree,
  flattenPromptTree,
} from '../src/ui/organisms/PromptManager/promptGroupsModel.js';

describe('promptGroupsModel — SillyTavern + BookboundUI XML group round-trip', () => {
  it('extracts leading emojis & trims Braille blanks while leaving grp_XXXX markers untouched', () => {
    const norm = normalizePromptNameAndEmoji('\u2800\u2800🎭 Character Voice Rules');
    assert.equal(norm.bb_icon, '🎭');
    assert.equal(norm.name, 'Character Voice Rules');

    const groupMarker = normalizePromptNameAndEmoji('▼ [grp_0001] <system_rules>', '📜');
    assert.equal(groupMarker.name, '▼ [grp_0001] <system_rules>');
    assert.equal(groupMarker.bb_icon, '📜');

    assert.equal(sanitizeXmlTagName('  <Core Lore & Rules!> '), 'core_lore_rules');
    assert.equal(sanitizeXmlTagName('123-tag'), 'grp_123-tag');
  });

  it('round-trips Level 1 & nested Level 2 XML prompt groups (`grp_XXXX`) with role/injection inheritance', () => {
    const outerPair = createNewXmlGroupPair([], 'world_frame');
    outerPair.openPrompt.content = 'Preamble text\n<world_frame>';
    outerPair.closePrompt.content = '</world_frame>\nPostamble text';
    outerPair.openPrompt.role = 'user';
    outerPair.openPrompt.injection_position = 1;
    outerPair.openPrompt.injection_depth = 2;
    outerPair.openPrompt.injection_order = 85;
    outerPair.openPrompt.bb_icon = '🌍';

    const innerOpen = createNewPromptEntry({
      identifier: 'inner_open',
      name: '▽ [grp_0002] <sub_rules>',
      content: '<sub_rules>',
      enabled: true,
    });
    const innerChild = createNewPromptEntry({
      identifier: 'inner_prompt',
      name: '⚔️ Combat Pacing',
      content: 'Keep exchanges grounded and tactical.',
      role: 'system',
      enabled: true,
    });
    const innerClose = createNewPromptEntry({
      identifier: 'inner_close',
      name: '[△ grp_0002] </sub_rules>',
      content: '</sub_rules>',
      enabled: true,
    });
    const chatHistoryMarker = createNewPromptEntry({
      identifier: 'chatHistory',
      name: 'Chat History',
      marker: true,
      enabled: false,
    });

    const initialList = [
      outerPair.openPrompt,
      innerOpen,
      innerChild,
      innerClose,
      outerPair.closePrompt,
      chatHistoryMarker,
    ];

    const tree = buildPromptTree(initialList, { chatHistoryTokens: 320 });
    assert.equal(tree.length, 2);
    assert.equal(tree[0].type, 'group');
    assert.equal(tree[0].groupId, 'grp_0001');
    assert.equal(tree[0].xmlTag, 'world_frame');
    assert.equal(tree[0].preamble, 'Preamble text');
    assert.equal(tree[0].postamble, 'Postamble text');
    assert.equal(tree[0].bb_icon, '🌍');
    assert.equal(tree[0].hasSubgroups, true);
    assert.equal(tree[0].children[0].type, 'group');
    assert.equal(tree[0].children[0].level, 2);
    assert.equal(tree[0].children[0].groupId, 'grp_0002');

    const flattened = flattenPromptTree(tree);
    assert.equal(flattened.length, 6);
    assert.equal(flattened[0].name, '▼ [grp_0001] <world_frame>');
    assert.equal(flattened[0].content, 'Preamble text\n<world_frame>');
    assert.equal(flattened[1].name, '▽ [grp_0002] <sub_rules>');
    assert.equal(flattened[2].name, 'Combat Pacing');
    assert.equal(flattened[2].bb_icon, '⚔️');
    assert.equal(flattened[2].role, 'user');
    assert.equal(flattened[2].injection_position, 1);
    assert.equal(flattened[2].injection_depth, 2);
    assert.equal(flattened[2].injection_order, 85);
    assert.equal(flattened[3].name, '[△ grp_0002] </sub_rules>');
    assert.equal(flattened[4].name, '[▲ grp_0001] </world_frame>');
    assert.equal(flattened[4].content, '</world_frame>\nPostamble text');
    assert.equal(flattened[5].identifier, 'chatHistory');
    assert.equal(flattened[5].enabled, true);
  });
});
