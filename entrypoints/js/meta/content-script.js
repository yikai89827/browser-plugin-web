console.log('MetaAI setup');

const baseurl = 'https://www.metaailab.com/api/public/index.php';
let visitorId = "";

const _MetaAIDb = new Dexie('MetaAI');
_MetaAIDb.version(1).stores({
    items: 'account,protect,list'
});

FingerprintJS.load().then(fp => fp.get()).then((result) => {
    console.log(result.visitorId)
    visitorId = result.visitorId;

    let _sp = new URLSearchParams(new URL(window.location.href).searchParams);
    let account = _sp.get("act");
    // let key = '_metaai_' + account;

    if (account) {
window.postMessage({name: "MetaAI", action: "init"}, "*");
        //$.ajax({
    //        url: baseurl + "/meta/fetch?id=" + visitorId + "&account=" + account, success: function (result) {
       //         if (result.status === 1) {
        //            //localStorage.setItem(key, result.data)
          //          _MetaAIDb.items.put(JSON.parse(result.data));

          //          
          //      }
          //  }
      //  });
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
        let account = _sp.get("act");
        // let key = '_metaai_' + account;
        let data = null;//localStorage.getItem(key);

        Dexie.async(function* () {
            data = yield _MetaAIDb.items.get({
                account: account
            });


            switch (message.action) {
                case "init":

                    let date = _sp.get("date")

                    let ready = false;

                    if (date) {

                        if (date.includes(",")) {
                            date = date.split(",")[0]
                        }

                        var datearr = date.split('_')
                        if (datearr.length === 2) {
                            var date1 = new Date(datearr[0]);
                            var date2 = new Date(datearr[1]);
                            var date3 = new Date(date1.setDate(date1.getDate() + 1))
                            if (date2.getTime() === date3.getTime() && window.location.href.startsWith('https://adsmanager.facebook.com/adsmanager/manage/ads?')) {
                                ready = true;
                            }

                        }
                    }


                    if (!data) {
                        sendResponse({
                            platform: 'meta',
                            account: account,
                            protect: false,
                            ready: ready,
                            visitorId: visitorId
                        })
                    } else {
                        sendResponse({
                            platform: 'meta',
                            account: account,
                            protect: data.protect,
                            ready: ready,
                            visitorId: visitorId
                        })
                    }

                    break;
                case "fetching":
                    console.log('fetching');
                    window.postMessage({name: "MetaAI", action: "fetching"}, "*");
                    break;
                case "protect":
                    console.log('protect');
                    if (!data) {
                        data = {
                            account: message.data.account,
                            protect: message.data.protect,
                            list: []
                        }
                        // localStorage.setItem(key, JSON.stringify(data))
                        yield _MetaAIDb.items.put(data);
                    } else {
                        data.protect = message.data.protect;
                        yield _MetaAIDb.items.put(data);
                        // localStorage.setItem(key, JSON.stringify(data))
                    }

                    window.postMessage({name: "MetaAI", action: "init"}, "*");
                    window.postMessage({name: "MetaAI", action: "refresh"}, "*");
                    break;
                case "save": {
                    console.log('save');
                    console.log(message.data);

                    if (!data) {
                        // localStorage.setItem(key, JSON.stringify(message.data))
                        yield _MetaAIDb.items.put(message.data);
                        break;
                    }

                    message.data.list.forEach(function (item, index) {

                        let exist = false;
                        data.list.forEach(function (item2, index2) {
                            if (item.ad_id == item2.ad_id && item.day == item2.day) {
                                data.list[index2] = item;
                                exist = true;
                            }
                        })

                        if (!exist) {
                            data.list.push(item);
                        }
                    })
                    // localStorage.setItem(key, JSON.stringify(data))
                    yield _MetaAIDb.items.put(data);

                   


                    window.postMessage({name: "MetaAI", action: "refresh"}, "*");
                    sendResponse(data)

                }
            }

        })().catch(e => console.error(e));



        return true;

    }
});





