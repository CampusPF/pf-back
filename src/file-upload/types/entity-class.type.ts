import { Category } from '../../categories/entities/category.entity';
import { CourseEnrollment } from '../../course-enrollments/entities/course-enrollment.entity';
import { CourseModule } from '../../course-modules/entities/course-module.entity';
import { Course } from '../../courses/entities/course.entity';
import { Lesson } from '../../lessons/entities/lesson.entity';
import { LessonProgress } from '../../lesson-progress/entities/lesson-progress.entity';
import { User } from '../../users/entities/user.entity';
import { Subscription } from '../../subscriptions/entities/subscription.entity';

export type EntityClassType = 
  | typeof Category 
  | typeof CourseEnrollment 
  | typeof CourseModule 
  | typeof Course 
  | typeof Lesson 
  | typeof LessonProgress 
  | typeof User 
  | typeof Subscription;
