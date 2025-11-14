import musicSdk from '@/utils/musicSdk'
import RNFetchBlob from 'rn-fetch-blob'
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'

import {addListMusics, removeListMusics, updateListMusicPosition, updateListMusics,} from '@/core/list'
import {playList, playListById, playNext} from '@/core/player/player'
import {addTempPlayList} from '@/core/player/tempPlayList'

import {similar, sortInsert, toOldMusicInfo} from '@/utils'
import {confirmDialog, openUrl, requestStoragePermission, shareMusic, toast} from '@/utils/tools'
import {addDislikeInfo, hasDislike} from '@/core/dislikeList'

import {type SelectInfo} from './ListMenu'
import {type Metadata} from '@/components/MetadataEditModal'

import {getFileExtension, getFileExtensionFromUrl} from './download/utils'
import {mergeLyrics} from './download/lrcTool'

import {getListMusicSync} from '@/utils/listManage'
import {getLyricInfo, getMusicUrl, getPicUrl} from '@/core/music/online'
import {writeLyric, writeMetadata, writePic} from '@/utils/localMediaMetadata'
import {downloadFile} from '@/utils/fs'

export const handlePlay = (listId: SelectInfo['listId'], index: SelectInfo['index']) => {
  void playList(listId, index)
}
export const handlePlayLater = (
  listId: SelectInfo['listId'],
  musicInfo: SelectInfo['musicInfo'],
  selectedList: SelectInfo['selectedList'],
  onCancelSelect: () => void
) => {
  if (selectedList.length) {
    addTempPlayList(selectedList.map((s) => ({listId, musicInfo: s})))
    onCancelSelect()
  } else {
    addTempPlayList([{listId, musicInfo}])
  }
}

export const handleRemove = (
  listId: SelectInfo['listId'],
  musicInfo: SelectInfo['musicInfo'],
  selectedList: SelectInfo['selectedList'],
  onCancelSelect: () => void
) => {
  if (selectedList.length) {
    void confirmDialog({
      message: global.i18n.t('list_remove_music_multi_tip', {num: selectedList.length}),
      confirmButtonText: global.i18n.t('list_remove_tip_button'),
    }).then((isRemove) => {
      if (!isRemove) return
      void removeListMusics(
        listId,
        selectedList.map((s) => s.id)
      )
      onCancelSelect()
    })
  } else {
    void removeListMusics(listId, [musicInfo.id])
  }
}

export const handleUpdateMusicPosition = (
  position: number,
  listId: SelectInfo['listId'],
  musicInfo: SelectInfo['musicInfo'],
  selectedList: SelectInfo['selectedList'],
  onCancelSelect: () => void
) => {
  if (selectedList.length) {
    void updateListMusicPosition(
      listId,
      position,
      selectedList.map((s) => s.id)
    )
    onCancelSelect()
  } else {
    // console.log(listId, position, [musicInfo.id])
    void updateListMusicPosition(listId, position, [musicInfo.id])
  }
}

export const handleUpdateMusicInfo = (
  listId: SelectInfo['listId'],
  musicInfo: LX.Music.MusicInfoLocal,
  newInfo: Metadata
) => {
  void updateListMusics([
    {
      id: listId,
      musicInfo: {
        ...musicInfo,
        name: newInfo.name,
        singer: newInfo.singer,
        meta: {
          ...musicInfo.meta,
          albumName: newInfo.albumName,
        },
      },
    },
  ])
}

export const handleShare = (musicInfo: SelectInfo['musicInfo']) => {
  shareMusic(
    settingState.setting['common.shareType'],
    settingState.setting['download.fileName'],
    musicInfo
  )
}

export const searchListMusic = (list: LX.Music.MusicInfo[], text: string) => {
  let result: LX.Music.MusicInfo[] = []
  let rxp = new RegExp(
    text
      .split('')
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/, '\\$&'))
      .join('.*') + '.*',
    'i'
  )
  for (const mInfo of list) {
    const str = `${mInfo.name}${mInfo.singer}${mInfo.meta.albumName ? mInfo.meta.albumName : ''}`
    if (rxp.test(str)) result.push(mInfo)
  }

  const sortedList: Array<{ num: number; data: LX.Music.MusicInfo }> = []

  for (const mInfo of result) {
    sortInsert(sortedList, {
      num: similar(
        text,
        `${mInfo.name}${mInfo.singer}${mInfo.meta.albumName ? mInfo.meta.albumName : ''}`
      ),
      data: mInfo,
    })
  }
  return sortedList.map((item) => item.data).reverse()
}

export const handleShowMusicSourceDetail = async (minfo: SelectInfo['musicInfo']) => {
  const url = musicSdk[minfo.source as LX.OnlineSource]?.getMusicDetailPageUrl(
    toOldMusicInfo(minfo)
  )
  if (!url) return
  void openUrl(url)
}

export const handleDislikeMusic = async (musicInfo: SelectInfo['musicInfo']) => {
  const confirm = await confirmDialog({
    message: musicInfo.singer
      ? global.i18n.t('lists_dislike_music_singer_tip', {
        name: musicInfo.name,
        singer: musicInfo.singer,
      })
      : global.i18n.t('lists_dislike_music_tip', {name: musicInfo.name}),
    cancelButtonText: global.i18n.t('cancel_button_text_2'),
    confirmButtonText: global.i18n.t('confirm_button_text'),
    bgClose: false,
  })
  if (!confirm) return
  await addDislikeInfo([{name: musicInfo.name, singer: musicInfo.singer}])
  toast(global.i18n.t('lists_dislike_music_add_tip'))
  if (hasDislike(playerState.playMusicInfo.musicInfo)) {
    void playNext(true)
  }
}

export const handleToggleSource = async (
  listId: string,
  musicInfo: LX.Music.MusicInfo,
  toggleMusicInfo: LX.Music.MusicInfoOnline
) => {
  const list = getListMusicSync(listId)
  const oldId = musicInfo.id
  let oldIdx = list.findIndex((m) => m.id == oldId)
  if (oldIdx < 0) {
    void addListMusics(listId, [toggleMusicInfo], settingState.setting['list.addMusicLocationType'])
    return true
  }
  const id = toggleMusicInfo.id
  const index = list.findIndex((m) => m.id == id)
  const removeIds = [oldId]
  if (index > -1) {
    if (
      !(await confirmDialog({
        message: global.i18n.t('music_toggle__duplicate_tip'),
        cancelButtonText: global.i18n.t('dialog_cancel'),
        confirmButtonText: global.i18n.t('dialog_confirm'),
      }))
    )
      return false
    removeIds.push(id)
  }
  void removeListMusics(listId, removeIds).then(async () => {
    await addListMusics(listId, [toggleMusicInfo], 'bottom')
    if (index != -1 && index < oldIdx) oldIdx--
    await updateListMusicPosition(listId, oldIdx, [id])
    if (
      playerState.playMusicInfo.listId == listId &&
      playerState.playMusicInfo.musicInfo?.id == oldId
    ) {
      void playListById(listId, toggleMusicInfo.id)
    }
  })
  return true
}

export const handleDownload = async (musicInfo: LX.Music.MusicInfo, quality: LX.Quality) => {
  try {
    await requestStoragePermission()
    try {
      const url = await getMusicUrl({
        // @ts-ignore
        musicInfo,
        quality,
        isRefresh: true,
      })
      const extension = getFileExtension(quality)
      const fileName = settingState.setting['download.fileName']
        .replace('歌名', musicInfo.name)
        .replace('歌手', musicInfo.singer)
      const downloadDir = RNFetchBlob.fs.dirs.MusicDir + '/IKUN Music' || '/IKUN Music'
      const path = `${downloadDir}/${fileName}.${extension}`

      const downloader = RNFetchBlob.config({
        fileCache: true,
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          path: path,
          title: `${musicInfo.name} - ${musicInfo.singer}`,
          description: '正在下载文件...',
        },
      })
      const data = await downloader.fetch('GET', url)
      const filePath = data.path()

      toast(`${fileName} 下载成功! 正在写入元数据`, 'short')

      if (settingState.setting['download.writeMetadata']) {
        try {
          await writeMetadata(
            filePath,
            {
              name: musicInfo.name,
              singer: musicInfo.singer,
              albumName: musicInfo.meta.albumName,
            },
            true
          )
          toast(`写入标签成功!`, 'short')
        } catch (err) {
          console.log(err)
          toast(`${fileName} 写入元数据失败!`, 'short')
        }
      }

      if (settingState.setting['download.writeLyric']) {
        try {
          const lyrics = await getLyricInfo({
            // @ts-ignore
            musicInfo: musicInfo,
            isRefresh: true,
            allowToggleSource: false,
          })
          const lyric = mergeLyrics(lyrics.lyric, lyrics.tlyric, lyrics.rlyric)
          // console.log(lyric)
          await writeLyric(filePath, lyric)
          toast(`写入歌词成功!`, 'short')
        } catch (err) {
          console.log(err)
          toast(`${fileName} 写入歌词失败!`, 'short')
        }
      }

      if (settingState.setting['download.writePicture']) {
        try {
          const picUrl = await getPicUrl({
            // @ts-ignore
            musicInfo: musicInfo,
            allowToggleSource: false,
          })
          console.log(picUrl)
          const extension = getFileExtensionFromUrl(picUrl)
          const picPath = `${downloadDir}/temp_${musicInfo.id}.${extension}`
          downloadFile(picUrl, picPath)
          await writePic(filePath, picPath)
          await RNFetchBlob.fs.unlink(picPath)
          toast(`写入封面成功!`, 'short')
        } catch (err) {
          console.log(err)
          toast(`${fileName} 写入封面失败!`, 'short')
        }
      }
      toast(`路径: ${filePath}`, 'long')
    } catch (e) {
      console.log(e)
      toast(`文件下载失败：${e}`)
    }
  } catch (e) {
    console.log(e)
    return await Promise.reject(e ?? '权限获取失败')
  }
}
