import { $dom } from '../library/dom'
import { cardActive } from '../page/common'
import { pageScroll, transition } from '../library/anime'
import { vendorCss, vendorJs } from '../library/loadFile'
import { pjaxScript } from '../library/scriptPjax'
import { resizeHandle } from '../globals/handles'
import {
  CONFIG,
  loadCat,
  menuToggle,
  setImgMover,
  setLocalHash, setLocalUrl, setOriginTitle,
  sideBar,
  toolPlayer
} from '../globals/globalVars'
import { pagePosition, positionInit } from '../globals/tools'
import { menuActive, sideBarTab, sidebarTOC } from '../components/sidebar'
import { Loader, isOutime } from '../globals/thirdparty'
import { tabFormat } from '../page/tab'
import { lazyLoad } from 'unlazy'

export const pjaxReload = () => {
  pagePosition()

  if (sideBar.hasClass('on')) {
    transition(sideBar, 0, () => {
      sideBar.removeClass('on')
      menuToggle.removeClass('close')
    }) // 'transition.slideRightOut'
  }
  const mainNode = document.getElementById('main')
  mainNode.innerHTML = ''
  mainNode.appendChild(loadCat.lastChild.cloneNode(true))
  pageScroll(0)
}

export const siteRefresh = async (reload) => {
  if (__shokax_antiFakeWebsite__) {
    if (window.location.origin !== CONFIG.hostname && window.location.origin !== "http://localhost:4000") {
      window.location.href = CONFIG.hostname
      /*! 我知道你正在试图去除这段代码，虽然我无法阻止你，但我劝你好自为之 */
      alert('检测到非法仿冒网站，已自动跳转回正确首页;\nWe have detected a fake website, and you have been redirected to the correct homepage.')
    }
  }

  setLocalHash(0)
  setLocalUrl(window.location.href)

  setImgMover(document.getElementById('imgs'))

  vendorCss('katex');
  await import('katex/dist/contrib/copy-tex.mjs')
  vendorCss('mermaid')

  // 懒加载背景图
  const lazyBg = new IntersectionObserver(function (entries, observer) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement
        el.style.backgroundImage = `url("${el.getAttribute('data-background-image')}")`
        el.removeAttribute('data-background-image')
        observer.unobserve(el)
      }
    })
  }, {
    root: null,
    threshold: 0.2
  })
  document.querySelectorAll('[data-background-image]').forEach(el => {
    lazyBg.observe(el)
  })

  if (reload !== 1) {
    $dom.each('script[data-pjax]', pjaxScript)
  }

  setOriginTitle(document.title)

  resizeHandle()

  menuActive()

  sideBarTab()
  sidebarTOC()

  import('../page/post').then(({postBeauty}) => {
    postBeauty()
  })

  const cpel = document.getElementById('copyright')
  if (cpel) {
    const comment = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (__shokax_waline__) {
            import('../components/comments').then(({walinePageview, walineComment}) => {
              walinePageview()
              walineComment()
            })
          }
          if (__shokax_twikoo__) {
            import('../components/tcomments').then(({twikooComment}) => {
              twikooComment()
            })
          }
          comment.disconnect()
        }
      })
    }, {
      root: null,
      threshold: 0.2
    })

    comment.observe(cpel)
  }

  lazyLoad()

  if (__shokax_waline__) {
    import('../components/comments').then(async ({walineRecentComments}) => {
      await walineRecentComments()
    })
  }

  if (__shokax_twikoo__) {
    import('../components/tcomments').then(async ({twikooRecentComments}) => {
      await twikooRecentComments()
    })
  }

  if (__shokax_tabs__) {
    tabFormat()
  }

  if (__shokax_player__) {
    toolPlayer.player.load(LOCAL.audio || CONFIG.audio || {})
  }
  Loader.hide(100)

  setTimeout(() => {
    positionInit()
  }, 500)

  cardActive()

  if (__shokax_outime__ && LOCAL.ispost) {
    isOutime()
  }
}
