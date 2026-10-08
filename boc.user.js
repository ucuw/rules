// ==UserScript==
// @name         中国银行预选卡号 / 制卡进度
// @namespace    https://open.boc.cn/
// @version      1.1.0
// @description  读取中国银行申请查询页面中的预选卡号和制卡进度
// @match        https://open.boc.cn/bankcard/cardReserve/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STATUS_MAP = {
        '00': '待制卡',
        '01': '制卡中',
        '02': '流程异常',
        '03': '制卡完毕，已寄出到网点',
        '04': '待领卡',
        '05': '流程异常',
        '06': '已领卡',
        '07': '流程异常'
    };

    let lastCardNo = null;
    let lastStatus = null;

    /*
     * 只读取原教程指定的数据。
     * 不修改 Vue 对象，也不修改中行网页原有 DOM。
     */
    function readRecordInfo() {
        try {
            const el = document.querySelector('.progress-result-wrap');

            if (!el) {
                return null;
            }

            const vue = el.__vue__;

            if (!vue) {
                return null;
            }

            /*
             * 原教程：
             * el.__vue__.$parent.recordInfo
             */
            if (
                vue.$parent &&
                vue.$parent.recordInfo
            ) {
                return vue.$parent.recordInfo;
            }

            /*
             * 防止 Vue 层级有小变化。
             * 最多向上找 8 层。
             */
            let current = vue;

            for (let i = 0; i < 8; i++) {
                if (!current) {
                    break;
                }

                if (current.recordInfo) {
                    return current.recordInfo;
                }

                current = current.$parent;
            }

        } catch (error) {
            console.warn(
                '[BOC] 读取数据失败：',
                error
            );
        }

        return null;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /*
     * 创建完全独立的显示窗口。
     *
     * 不使用原网页 class。
     * 不修改 progress-result-wrap。
     */
    function showInfo(cardNo, statusCode) {
        const statusText =
            STATUS_MAP[statusCode] ||
            `未知状态 (${statusCode || '无'})`;

        let panel =
            document.getElementById(
                '__boc_card_reader_panel__'
            );

        if (!panel) {
            panel =
                document.createElement('div');

            panel.id =
                '__boc_card_reader_panel__';

            panel.style.cssText = [
                'position:fixed',
                'right:20px',
                'bottom:20px',
                'width:320px',
                'max-width:calc(100vw - 40px)',
                'padding:18px',
                'box-sizing:border-box',
                'background:#fff',
                'color:#222',
                'border:1px solid #ddd',
                'border-radius:12px',
                'box-shadow:0 6px 24px rgba(0,0,0,.18)',
                'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif',
                'z-index:2147483647'
            ].join(';');

            document.body.appendChild(panel);
        }

        panel.innerHTML = `
            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:16px;
                "
            >
                <strong style="font-size:17px;">
                    💳 制卡信息
                </strong>

                <button
                    id="__boc_close__"
                    style="
                        border:0;
                        background:transparent;
                        font-size:22px;
                        cursor:pointer;
                        color:#888;
                    "
                >
                    ×
                </button>
            </div>

            <div
                style="
                    color:#888;
                    font-size:12px;
                    margin-bottom:5px;
                "
            >
                预选卡号
            </div>

            <div
                style="
                    font-size:19px;
                    font-weight:600;
                    margin-bottom:16px;
                    word-break:break-all;
                    user-select:text;
                "
            >
                ${escapeHtml(cardNo)}
            </div>

            <div
                style="
                    color:#888;
                    font-size:12px;
                    margin-bottom:5px;
                "
            >
                制卡进度
            </div>

            <div
                style="
                    font-size:17px;
                    font-weight:600;
                    margin-bottom:5px;
                "
            >
                ${escapeHtml(statusText)}
            </div>

            <div
                style="
                    color:#999;
                    font-size:12px;
                    margin-bottom:16px;
                "
            >
                状态码：${escapeHtml(statusCode)}
            </div>

            <button
                id="__boc_copy__"
                style="
                    width:100%;
                    border:0;
                    border-radius:8px;
                    padding:10px;
                    background:#b30019;
                    color:#fff;
                    cursor:pointer;
                "
            >
                复制卡号
            </button>
        `;

        const closeButton =
            panel.querySelector(
                '#__boc_close__'
            );

        closeButton.onclick = function () {
            panel.remove();
        };

        const copyButton =
            panel.querySelector(
                '#__boc_copy__'
            );

        copyButton.onclick = async function () {
            try {
                await navigator.clipboard.writeText(
                    cardNo
                );

                copyButton.textContent =
                    '✓ 已复制';

                setTimeout(() => {
                    copyButton.textContent =
                        '复制卡号';
                }, 1200);

            } catch (error) {
                prompt(
                    '请手动复制卡号：',
                    cardNo
                );
            }
        };
    }

    function check() {
        const info =
            readRecordInfo();

        /*
         * 页面还在登录、验证码、
         * 填表等阶段时什么都不做。
         */
        if (!info) {
            return;
        }

        const cardNo =
            String(
                info.cardNo ?? ''
            ).trim();

        const statusCode =
            String(
                info.mkcrdProgreSts ?? ''
            ).trim();

        /*
         * 没有读取到任何有效内容，
         * 继续等待。
         */
        if (!cardNo && !statusCode) {
            return;
        }

        /*
         * 内容没变化时不碰 DOM。
         */
        if (
            cardNo === lastCardNo &&
            statusCode === lastStatus
        ) {
            return;
        }

        lastCardNo =
            cardNo;

        lastStatus =
            statusCode;

        console.log(
            '[BOC] 预选卡号：',
            cardNo
        );

        console.log(
            '[BOC] 制卡状态：',
            statusCode,
            STATUS_MAP[statusCode] || '未知'
        );

        console.log(
            '[BOC] recordInfo：',
            info
        );

        showInfo(
            cardNo || '未获取到',
            statusCode
        );
    }

    /*
     * 重点：
     *
     * 不使用 MutationObserver。
     * 不监听页面 DOM 更新。
     *
     * 只每秒进行一次只读检查。
     */
    setInterval(
        check,
        1000
    );

    /*
     * 页面加载后先检查一次。
     */
    setTimeout(
        check,
        1500
    );

})();
