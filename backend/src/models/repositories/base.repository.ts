import {
  Document,
  FilterQuery,
  Model,
  PopulateOptions,
  ProjectionType,
  QueryOptions,
  Types,
  UpdateQuery,
} from 'mongoose';
import { IPaginatedResult } from '../../common/interfaces';

export interface IFindOptions<T> {
  projection?: ProjectionType<T>;
  options?: QueryOptions<T>;
  populate?: PopulateOptions | (string | PopulateOptions)[];
  sort?: string | Record<string, 1 | -1>;
}

export abstract class BaseRepository<TDocument extends Document> {
  protected constructor(protected readonly model: Model<TDocument>) {}

  async create(data: Partial<TDocument> | Record<string, unknown>): Promise<TDocument> {
    const createdDocument = new this.model(data);
    return createdDocument.save();
  }

  async findOne(
    filter: FilterQuery<TDocument>,
    findOptions?: IFindOptions<TDocument>,
  ): Promise<TDocument | null> {
    const query = this.model.findOne(
      { deletedAt: null, ...filter },
      findOptions?.projection,
      findOptions?.options,
    );
    if (findOptions?.populate) {
      query.populate(findOptions.populate);
    }
    return query.exec();
  }

  async findById(
    id: string | Types.ObjectId,
    findOptions?: IFindOptions<TDocument>,
  ): Promise<TDocument | null> {
    return this.findOne({ _id: id } as FilterQuery<TDocument>, findOptions);
  }

  async findAll(
    filter: FilterQuery<TDocument> = {},
    findOptions?: IFindOptions<TDocument>,
  ): Promise<TDocument[]> {
    const query = this.model.find(
      { deletedAt: null, ...filter },
      findOptions?.projection,
      findOptions?.options,
    );
    if (findOptions?.sort) {
      query.sort(findOptions.sort);
    }
    if (findOptions?.populate) {
      query.populate(findOptions.populate);
    }
    return query.exec();
  }

  async paginate(
    filter: FilterQuery<TDocument> = {},
    page = 1,
    limit = 10,
    findOptions?: IFindOptions<TDocument>,
  ): Promise<IPaginatedResult<TDocument>> {
    const sanitizedPage = Math.max(1, Number(page) || 1);
    const sanitizedLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    const skip = (sanitizedPage - 1) * sanitizedLimit;

    const effectiveFilter: FilterQuery<TDocument> = {
      deletedAt: null,
      ...filter,
    };

    const dataQuery = this.model
      .find(effectiveFilter, findOptions?.projection, findOptions?.options)
      .skip(skip)
      .limit(sanitizedLimit);

    if (findOptions?.sort) {
      dataQuery.sort(findOptions.sort);
    } else {
      dataQuery.sort('-createdAt');
    }

    if (findOptions?.populate) {
      dataQuery.populate(findOptions.populate);
    }

    const [docs, totalDocs] = await Promise.all([
      dataQuery.exec(),
      this.model.countDocuments(effectiveFilter).exec(),
    ]);

    const totalPages = Math.ceil(totalDocs / sanitizedLimit) || 1;

    return {
      docs,
      meta: {
        totalDocs,
        limit: sanitizedLimit,
        page: sanitizedPage,
        totalPages,
        hasNextPage: sanitizedPage < totalPages,
        hasPrevPage: sanitizedPage > 1,
      },
    };
  }

  async findOneAndUpdate(
    filter: FilterQuery<TDocument>,
    update: UpdateQuery<TDocument>,
    options: QueryOptions<TDocument> = { new: true, runValidators: true },
  ): Promise<TDocument | null> {
    return this.model
      .findOneAndUpdate({ deletedAt: null, ...filter }, update, options)
      .exec();
  }

  async findByIdAndUpdate(
    id: string | Types.ObjectId,
    update: UpdateQuery<TDocument>,
    options: QueryOptions<TDocument> = { new: true, runValidators: true },
  ): Promise<TDocument | null> {
    return this.findOneAndUpdate(
      { _id: id } as FilterQuery<TDocument>,
      update,
      options,
    );
  }

  async softDelete(id: string | Types.ObjectId): Promise<TDocument | null> {
    return this.findByIdAndUpdate(id, {
      $set: { deletedAt: new Date(), isActive: false },
    } as UpdateQuery<TDocument>);
  }

  async hardDelete(id: string | Types.ObjectId): Promise<boolean> {
    const result = await this.model.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async exists(filter: FilterQuery<TDocument>): Promise<boolean> {
    const doc = await this.model
      .exists({ deletedAt: null, ...filter })
      .exec();
    return Boolean(doc);
  }

  async count(filter: FilterQuery<TDocument> = {}): Promise<number> {
    return this.model.countDocuments({ deletedAt: null, ...filter }).exec();
  }
}

