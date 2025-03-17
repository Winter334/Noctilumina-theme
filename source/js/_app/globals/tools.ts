import { pageScroll } from '../library/anime'
import { $dom } from '../library/dom'
import { $storage } from '../library/storage'
import { BODY, CONFIG, LOCAL_HASH, LOCAL_URL, scrollAction, setLocalHash } from './globalVars'
import { createChild } from '../library/proto'

// 显示提示(现阶段用于版权及复制结果提示)
export const showtip = (msg: string): void | never => {
  if (!msg) {
    return
  }

  const tipbox = createChild(BODY, 'div', {
    innerHTML: msg,
    className: 'tip'
  })

  setTimeout(() => {
    tipbox.addClass('hide')
    setTimeout(() => {
      BODY.removeChild(tipbox)
    }, 300)
  }, 3000)
}

export const pagePosition = () => {
  // 判断配置项是否开启了自动记录滚动位置
  if (CONFIG.auto_scroll) {
    // 将当前页面的滚动位置存入本地缓存
    $storage.set(LOCAL_URL, String(scrollAction.y))
  }
}

export const positionInit = (comment?: boolean) => {
  const handleScroll = () => {
    const anchor = window.location.hash
    let target: HTMLElement | number | null = null

    // 清除本地记录逻辑保持不变
    if (LOCAL_HASH) {
      $storage.del(LOCAL_URL)
      return
    }

    // 处理哈希滚动
    if (anchor) {
      try {
        const decodedHash = decodeURIComponent(anchor).substring(1) // 完整解码哈希值
        target = document.getElementById(decodedHash)
        
        // 如果找不到元素，可能是动态内容未加载，延时重试
        if (!target && comment) {
          setTimeout(() => {
            const retryTarget = document.getElementById(decodedHash)
            if (retryTarget) pageScroll(retryTarget)
          }, 800)
        }
      } catch (e) {
        console.error("Hash decode error:", e)
      }
    } else {
      // 无哈希时使用保存的滚动位置
      target = CONFIG.auto_scroll ? parseInt($storage.get(LOCAL_URL)) : 0
    }

    // 执行滚动逻辑
    if (target) {
      requestAnimationFrame(() => {
        pageScroll(target!)
        setLocalHash(1)
      })
    }
  }

  // 执行时机控制
  if (document.readyState !== "loading") {
    setTimeout(handleScroll, 50) // 确保在浏览器默认行为之后执行
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(handleScroll, 50)
    })
  }
}

/*
基于clipboard API的复制功能，仅在https环境下有效
*/
export const clipBoard = (str: string, callback?: (result:boolean) => void) => {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(str).then(() => {
      callback && callback(true)
    }, () => {
      callback && callback(false)
    })
  } else {
    console.error('Too old browser, clipborad API not supported.')
    callback && callback(false)
  }
}
