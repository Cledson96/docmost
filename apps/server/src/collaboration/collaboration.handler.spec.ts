import { CollaborationHandler } from './collaboration.handler';
import * as Y from 'yjs';

describe('CollaborationHandler', () => {
  it('reads a page snapshot from the directly connected live document', async () => {
    const doc = new Y.Doc();
    doc.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')]);
    const disconnect = jest.fn();
    const hocuspocus = {
      openDirectConnection: jest.fn().mockResolvedValue({
        transact: async (fn: (document: Y.Doc) => void) => fn(doc),
        disconnect,
      }),
    };
    const handler = new CollaborationHandler();

    const snapshot = await handler
      .getHandlers(hocuspocus as any)
      .getPageSnapshot('page-1', { user: {} as any });

    expect(snapshot.content).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
    expect(snapshot.revision).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hocuspocus.openDirectConnection).toHaveBeenCalledWith('page-1', {
      user: {},
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
