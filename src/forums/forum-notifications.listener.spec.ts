import { ForumNotificationsListener } from './forum-notifications.listener';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import {
  ForumPostUpdatedEvent,
  ForumReplyCreatedEvent,
  ForumSolutionMarkedEvent,
  ForumThreadCreatedEvent,
} from '../events';

describe('ForumNotificationsListener', () => {
  function makeListener() {
    const notifications = { create: jest.fn<Promise<object>, [Record<string, unknown>]>(async () => ({})) };
    const push = { sendToUser: jest.fn(async () => undefined) };
    const listener = new ForumNotificationsListener(
      notifications as unknown as NotificationsService,
      push as unknown as PushService,
    );
    return { listener, notifications, push };
  }

  it('avisa al docente cuando un alumno abre un hilo', async () => {
    const { listener, notifications, push } = makeListener();
    await listener.onThreadCreated(
      new ForumThreadCreatedEvent('t1', 'Duda', 'c1', 'Curso Node', ['teacher-1'], 'student-1'),
    );
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'teacher-1', type: 'forum_thread' }));
    expect(push.sendToUser).toHaveBeenCalledWith('teacher-1', expect.objectContaining({ url: '/dashboard/foros/hilo/t1' }));
  });

  it('también avisa a los compañeros inscriptos, no sólo al docente', async () => {
    const { listener, notifications } = makeListener();
    await listener.onThreadCreated(
      new ForumThreadCreatedEvent('t1', 'Duda', 'c1', 'Curso Node', ['teacher-1', 'student-2', 'student-1'], 'student-1'),
    );
    const notified = notifications.create.mock.calls.map(([input]) => input.userId as string).sort();
    expect(notified).toEqual(['student-2', 'teacher-1']);
  });

  it('no avisa al docente si él mismo abrió el hilo', async () => {
    const { listener, notifications } = makeListener();
    await listener.onThreadCreated(
      new ForumThreadCreatedEvent('t1', 'Aviso', 'c1', 'Curso Node', ['teacher-1'], 'teacher-1'),
    );
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('en una respuesta avisa a los participantes menos a quien responde, sin duplicados', async () => {
    const { listener, notifications } = makeListener();
    await listener.onReplyCreated(
      new ForumReplyCreatedEvent('t1', 'Duda', 'p9', 'student-2', ['student-1', 'student-2', 'teacher-1', 'student-1']),
    );
    const notified = notifications.create.mock.calls.map(([input]) => input.userId as string).sort();
    expect(notified).toEqual(['student-1', 'teacher-1']);
  });

  it('en una edición avisa a los participantes menos a quien editó, sin duplicados', async () => {
    const { listener, notifications } = makeListener();
    await listener.onPostUpdated(
      new ForumPostUpdatedEvent('t1', 'Duda', 'p9', 'student-2', ['student-1', 'student-2', 'teacher-1', 'student-1']),
    );
    const notified = notifications.create.mock.calls.map(([input]) => input.userId as string).sort();
    expect(notified).toEqual(['student-1', 'teacher-1']);
  });

  it('avisa al autor de la respuesta marcada como solución, salvo que la marcó él', async () => {
    const { listener, notifications } = makeListener();
    await listener.onSolutionMarked(new ForumSolutionMarkedEvent('t1', 'Duda', 'p1', 'student-1', 'teacher-1'));
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'student-1', type: 'forum_solution' }));

    notifications.create.mockClear();
    await listener.onSolutionMarked(new ForumSolutionMarkedEvent('t1', 'Duda', 'p1', 'teacher-1', 'teacher-1'));
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('un fallo de push no impide la notificación ni rompe el flujo', async () => {
    const { listener, notifications, push } = makeListener();
    push.sendToUser.mockRejectedValueOnce(new Error('push caído'));
    await expect(
      listener.onThreadCreated(new ForumThreadCreatedEvent('t1', 'Duda', 'c1', 'Curso', ['teacher-1'], 'student-1')),
    ).resolves.toBeUndefined();
    expect(notifications.create).toHaveBeenCalled();
  });
});
