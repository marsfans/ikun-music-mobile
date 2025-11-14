import { memo } from 'react'

import Section from '../../components/Section'
import IsEnable from './IsEnable'
import IsWriteLyrics from './IsWriteLyrics'
import IsWriteTags from './IsWriteTags'
import IsWriteCover from './IsWriteCover'
import FileNameFormat from './FileNameFormat'
import { useI18n } from '@/lang'
import SubTitle from '../../components/SubTitle'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_download')}>
      <IsEnable />
      <SubTitle title={t('setting_download_options_title')}>
        <IsWriteTags />
        <IsWriteLyrics />
        <IsWriteCover />
      </SubTitle>
      <FileNameFormat />
    </Section>
  )
})
