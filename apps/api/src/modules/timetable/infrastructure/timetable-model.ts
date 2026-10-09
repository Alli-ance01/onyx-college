import mongoose, { type Model, type Types } from 'mongoose';
import type { TimetableLessonInput } from '@onyx/contracts';
interface TimetableRecord {
  termId: Types.ObjectId;
  timeZone: string;
  version: number;
  lessons: TimetableLessonInput[];
}
const schema = new mongoose.Schema<TimetableRecord>(
  {
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true, immutable: true },
    timeZone: { type: String, required: true },
    version: { type: Number, required: true },
    lessons: [
      {
        _id: false,
        teachingAssignmentId: { type: String, required: true },
        weekday: { type: Number, min: 1, max: 5, required: true },
        startsAt: { type: String, required: true },
        endsAt: { type: String, required: true },
        room: { type: String, default: '' },
      },
    ],
  },
  { collection: 'timetables', timestamps: true, versionKey: false },
);
schema.index({ termId: 1 }, { unique: true, name: 'timetable_term_unique' });
export const TimetableModel =
  (mongoose.models.Timetable as Model<TimetableRecord> | undefined) ??
  mongoose.model<TimetableRecord>('Timetable', schema);
