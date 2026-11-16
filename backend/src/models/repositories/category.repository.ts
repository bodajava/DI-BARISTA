import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from '../schemas';
import { BaseRepository } from './base.repository';
import { escapeRegex } from '../../common/utilities/regex';

@Injectable()
export class CategoryRepository extends BaseRepository<CategoryDocument> {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {
    super(categoryModel);
  }

  async findBySlug(slug: string): Promise<CategoryDocument | null> {
    return this.findOne({ slug: slug.toLowerCase().trim() });
  }

  async findByNameOrSlug(
    name: string,
    slug: string,
  ): Promise<CategoryDocument | null> {
    return this.findOne({
      $or: [
        { name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') },
        { slug: slug.toLowerCase().trim() },
      ],
    });
  }
}
