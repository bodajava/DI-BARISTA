import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Brand, BrandDocument } from '../schemas';
import { BaseRepository } from './base.repository';
import { escapeRegex } from '../../common/utilities/regex';

@Injectable()
export class BrandRepository extends BaseRepository<BrandDocument> {
  constructor(
    @InjectModel(Brand.name) private readonly brandModel: Model<BrandDocument>,
  ) {
    super(brandModel);
  }

  async findBySlug(slug: string): Promise<BrandDocument | null> {
    return this.findOne({ slug: slug.toLowerCase().trim() });
  }

  async findByNameOrSlug(
    name: string,
    slug: string,
  ): Promise<BrandDocument | null> {
    return this.findOne({
      $or: [
        { name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') },
        { slug: slug.toLowerCase().trim() },
      ],
    });
  }
}

