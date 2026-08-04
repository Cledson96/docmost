import * as Y from 'yjs';
import {
  revisionForDocument,
  snapshotDocument,
} from './rich-content-yjs.util';

describe('rich content Yjs snapshots', () => {
  it('changes revision only when the Yjs state changes', () => {
    const doc = new Y.Doc();
    doc.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')]);

    const first = revisionForDocument(doc);

    expect(revisionForDocument(doc)).toBe(first);

    doc.getXmlFragment('default').get(0).setAttribute('id', 'p1');

    expect(revisionForDocument(doc)).not.toBe(first);
  });

  it('returns the live Tiptap JSON with its Yjs revision', () => {
    const doc = new Y.Doc();
    doc.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')]);

    const snapshot = snapshotDocument(doc);

    expect(snapshot.content).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    expect(snapshot.revision).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
