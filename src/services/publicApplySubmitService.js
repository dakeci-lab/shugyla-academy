import { isCloudMode } from '../lib/dataMode'
import { prepareCandidatePhotoForSubmit } from './candidatePhotoService'
import * as recruitmentSupabaseAdapter from './recruitmentSupabaseAdapter'
import * as recruitmentLocalAdapter from './recruitmentLocalAdapter'

/**
 * Public candidate submit for /apply/:slug.
 * Does not touch PlatformData / cloudStore / internal recruitment refresh.
 */
export async function submitPublicCandidateApplication(applicationData) {
  if (!applicationData?.vacancyId) throw new Error('Вакансия не указана')
  if (applicationData.formVersion == null) throw new Error('Анкета устарела. Обновите страницу.')

  let photoPayload = {
    photoUrl: null,
    photoPath: null,
    photoUploadId: applicationData.photoUploadId || null,
  }

  if (applicationData.photoFile && !applicationData.photoUploadId) {
    try {
      photoPayload = await prepareCandidatePhotoForSubmit(applicationData.photoFile, {
        vacancyId: applicationData.vacancyId,
        formVersion: applicationData.formVersion,
      })
    } catch (err) {
      throw new Error(err.message || 'Не удалось загрузить фото')
    }
  }

  if (!applicationData.submissionKey) throw new Error('Не удалось подготовить отправку. Обновите страницу.')

  const { photoFile: _photoFile, vacancySlug: _slug, ...rest } = applicationData
  const adapter = isCloudMode() ? recruitmentSupabaseAdapter : recruitmentLocalAdapter

  const result = await adapter.submitCandidateApplication({
    ...rest,
    photoUrl: photoPayload.photoUrl,
    photoPath: photoPayload.photoPath,
    photoUploadId: photoPayload.photoUploadId,
  })

  return {
    ...result,
    localPhotoWarning: photoPayload.isLocalFallback
      ? 'В локальном режиме фото сохраняется только для демо-превью.'
      : null,
  }
}
