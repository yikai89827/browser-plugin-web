console.log('MetaAI setup');

const baseurl = 'https://www.metaailab.com/api/public/index.php';
let visitorId = "";

const _MetaAIDb = new Dexie('GoogleAI');
_MetaAIDb.version(1).stores({
    items: '[group+day],account,campaign,group,day,cost,impressions,interactions,conversions,clicks,install,install_conversions,cost_inflated,inflated',
    protect: 'account,protect'
});

_MetaAIDb.items.where('cost_inflated').equals(0).delete()

FingerprintJS.load().then(fp => fp.get()).then((result) => {
    console.log(result.visitorId)
    visitorId = result.visitorId;

    let _sp = new URLSearchParams(new URL(window.location.href).searchParams);
    let account = _sp.get("__u");
    // let key = '_googleai_' + account;

    if (account) {
        $.ajax({
            url: baseurl + "/meta/fetch?id=" + visitorId + "&account=" + account, success: function (result) {
                if (result.status === 1) {
                    // localStorage.setItem(key, result.data)
                    window.postMessage({name: "MetaAI", action: "init"}, "*");
                }
            }
        });
    }

})

window.addEventListener("message", (event) => {

    if (event.data.name === "MetaAI" && event.data.action === "sending") {
        chrome.runtime.sendMessage({name: "MetaAI", action: "sending", data: event.data.data}, function (response) {
            console.log(response);
        });
        console.log(event);
    }

}, false);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.name === "MetaAI") {

        let _sp = new URLSearchParams(new URL(window.location.href).searchParams);
        let account = _sp.get("__u");
        // let key = '_metaai_' + account;
        let data = null;//localStorage.getItem(key);
        let protect = null;

        Dexie.async(function* () {
            protect = yield _MetaAIDb.protect.get({
                account: account
            });
            data = yield _MetaAIDb.items.toArray()

            switch (message.action) {
                case "init":

                    let ready = false;

                    let date = document.querySelector('.date-range-picker .button-text').textContent.replaceAll(' ', '')
                    if (!date.includes('–') && window.location.href.startsWith('https://ads.google.com/aw/adgroups')) {
                        ready = true;
                    }

                    sendResponse({
                        platform: 'google',
                        account: account,
                        protect: protect ? protect.protect : false,
                        ready: ready,
                        visitorId: visitorId
                    })

                    break;
                case "fetching":
                    console.log('fetching');
                    window.postMessage({name: "MetaAI", action: "fetching"}, "*");
                    break;
                case "protect":
                    console.log('protect');
                    if (!protect) {
                        protect = {
                            account: message.data.account,
                            protect: message.data.protect
                        }
                        yield _MetaAIDb.protect.put(protect);
                    } else {
                        protect.protect = message.data.protect;
                        yield _MetaAIDb.protect.put(protect);
                    }

                    window.postMessage({name: "MetaAI", action: "init"}, "*");
                    window.postMessage({name: "MetaAI", action: "refresh"}, "*");
                    break;
                case "save": {
                    console.log('save');
                    console.log(message.data);

                    if (!data) {
                        // localStorage.setItem(key, JSON.stringify(message.data))
                        yield _MetaAIDb.items.bulkPut(message.data.list.filter(o => o.inflated.cost > 0));
                        break;
                    }

                    message.data.list.forEach(function (item, index) {

                        let exist = false;
                        data.forEach(function (item2, index2) {
                            if (item.group === item2.group && item.day === item2.day) {
                                data[index2] = item;
                                exist = true;
                            }
                        })

                        if (!exist) {
                            data.push(item);
                        }
                    })
                    // localStorage.setItem(key, JSON.stringify(data))
                    yield _MetaAIDb.items.bulkPut(data);

                    $.ajax({
                        url: baseurl + "/google/save?id=" + visitorId + "&account=" + visitorId,
                        type: 'POST',
                        contentType: 'application/json', // 指定发送的数据格式为JSON
                        data: JSON.stringify(data), // 将JS对象转换为JSON字符串
                        success: function (response) {
                            // 请求成功时的回调函数
                            console.log(response);
                        },
                        error: function (xhr, status, error) {
                            // 请求失败时的回调函数
                            console.error(error);
                        }
                    });


                    window.postMessage({name: "MetaAI", action: "refresh"}, "*");
                    sendResponse(data)

                }
            }

        })().catch(e => console.error(e));


        return true;

    }
});





