import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumThread } from './entities/forum-thread.entity';
import { ForumPost } from './entities/forum-post.entity';
import { ForumCategory } from './entities/forum-category.entity';
import { Course } from '../courses/entities/course.entity';
import { ForumsService } from './forums.service';
import { ForumsController } from './forums.controller';
import { ForumAccessService } from './forum-access.service';
import { ForumCategoriesService } from './forum-categories.service';
import { ForumCategoriesController } from './forum-categories.controller';
import { ForumNotificationsListener } from './forum-notifications.listener';
import { LessonsModule } from '../lessons/lessons.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushModule } from '../push/push.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Foros de curso y foro general. El acceso al foro de un curso reutiliza la
 * regla de LessonsAccessService; los avisos salen por NotificationsService
 * (campanita) y PushService.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ForumThread, ForumPost, ForumCategory, Course]),
    LessonsModule,
    ModerationModule,
    NotificationsModule,
    PushModule,
    AuthModule,
  ],
  controllers: [ForumsController, ForumCategoriesController],
  providers: [
    ForumsService,
    ForumAccessService,
    ForumCategoriesService,
    ForumNotificationsListener,
  ],
})
export class ForumsModule { }
