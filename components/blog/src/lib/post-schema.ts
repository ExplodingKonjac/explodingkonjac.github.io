import { z } from 'astro/zod';

export const postSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z
      .array(
        z
          .string()
          .trim()
          .regex(
            /^[\p{L}\p{N}][\p{L}\p{N}\s_-]*$/u,
            'Tags must contain letters, numbers, spaces, hyphens, or underscores',
          ),
      )
      .default([])
      .transform((tags) => [...new Set(tags)]),
    draft: z.boolean().default(false),
    slug: z
      .string()
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
        'Use lowercase URL segments separated by hyphens or slashes',
      )
      .optional(),
  })
  .refine((data) => !data.updatedDate || data.updatedDate >= data.pubDate, {
    message: 'updatedDate must not precede pubDate',
    path: ['updatedDate'],
  });
