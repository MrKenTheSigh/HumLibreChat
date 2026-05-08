import departmentSchema from '~/schema/department';
import type { IDepartment } from '~/types';

export function createDepartmentModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.Department || mongoose.model<IDepartment>('Department', departmentSchema)
  );
}
