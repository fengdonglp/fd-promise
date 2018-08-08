/**
 * es5实现的Promise
 * Promises/A+规范(中文): http://www.ituring.com.cn/article/66566
 * Promises/A+规范(英文): https://promisesaplus.com/#point-35
 * Promise ES6官方规范，用于查看Promise Api接口规范，以符合ES6标准：http://www.ecma-international.org/ecma-262/6.0/#sec-promise-constructor
 * 实现TC39 提案的finally
 */
;(function (factory, global) {
  /* eslint-env amd */
  if (typeof define === 'function' && define.amd) {
    define(factory)
  } else if (typeof module === 'object' && module.exports) {
    module.exports = exports = factory()
  } else {
    global.Promise = factory()
  }
}(function () {
  // Promise状态
  var PENDING = 0
  var FULFILLED = 1
  var REJECTED = 2

  // 用于调试
  var ID = 1

  /**
   * Promise构造函数
   * @param {Function} resolver
   */
  function Promise (resolver) {
    // resolver必须是一个函数，与es6实现相同
    if (!isFunction(resolver)) {
      throw new TypeError('TypeError: Promise resolver ' + resolver.toString() + ' is not a function')
    }

    // 如果不是promise实例，例如直接调用Promise(resolver)，则新建一个实例
    if (!(this instanceof Promise)) return new Promise(resolver)

    this._status = PENDING
    this._value = undefined
    this._reason = undefined
    this._resolveCallback = []
    this._rejectCallback = []
    this._id = ID++

    var promise = this

    resolver(
      function (value) {
        // Promise需要异步操作，确保then()先执行，并添加执行栈
        // 注意一定要在这里添加异步执行，由于solveProcess并未异步，所以会一直执行下去，当进入到resolve时
        setTimeout(function () {
          solveProcess(promise, value, 'resolve')
        }, 0)
      },
      function (reason) {
        setTimeout(function () {
          solveProcess(promise, reason, 'reject')
        }, 0)
      }
    )
  }

  Promise.prototype = {
    constructor: Promise,

    /**
     * then方法
     * @param {Function|Any} onFulfilled 满足回调
     * @param {Function|Any} onRejected 拒绝回调
     * @return {Promise} 新的Promise,实现链式调用
     */
    then: function (onFulfilled, onRejected) {
      var promise = new Promise(noop)
      // 这里需要注意，原先的方法是包裹在new Promise() 内部并将其赋值给变量，然后内部使用该变量，但是new Promise()会直接执行，所以这个时候变量的值为undefined
      switch (this._status) {
        case PENDING:
          this._resolveCallback.push(makeCallback(promise, onFulfilled, 'resolve'))
          this._rejectCallback.push(makeCallback(promise, onRejected, 'reject'))
          break
        case FULFILLED:
          makeCallback(promise, onFulfilled, 'resolve')(this._value)
          break
        case REJECTED:
          makeCallback(promise, onRejected, 'reject')(this._reason)
          break
        default:
          break
      }

      return promise
    },

    /**
     * catch方法，其实就是then方法的语法糖
     * @param {Function|Any} 拒绝回调
     * @return {Promise} 新的Promise,实现链式调用
     */
    catch: function (onRejected) {
      return this.then(undefined, onRejected)
    },

    /**
     * 无论then/catch都会执行，可继续then/catch链式调用，并延续上一个promise的状态
     * 注意:finally方法是无状态的
     * @param {Function} callback
     * @return {Promise} 新的Promise,实现链式调用
     */
    finally: function (callback) {
      var P = this.constructor
      // 如果callback不是函数则忽略
      var result = isFunction(callback) ? callback() : null
      return this.then(
        function (value) {
          return P.resolve(result).then(function () {
            return value
          })
        },
        function (reason) {
          return P.reject(result).then(function () {
            throw reason
          })
        }
      )
    }
  }

  /**
   * resolve方法
   * @param {Any} value 走的是solveProcess流程
   * @return {Promise}
   */
  Promise.resolve = function (value) {
    return new Promise(function (resolve, reject) {
      resolve(value)
    })
  }

  /**
   * reject方法
   * @param {Any} reason 走的是solveProcess流程
   * @return {Promise}
   */
  Promise.reject = function (reason) {
    return new Promise(function (resolve, reject) {
      reject(reason)
    })
  }

  /**
   * all方法，执行数组中所有Promise，全部执行完成才执行链式then方法
   * 如果有一个Promise reject则直接拒绝
   * 未兼容所有Iterable，只支持Array
   * @param {Iterable} iterable
   * @return {Promise}
   */
  Promise.all = function (iterable) {
    if (!iterable.length) {
      throw new TypeError('arguments is not an Iterable')
    }

    return new Promise(function (resolve, reject) {
      var results = []
      var count = 0

      for (var index = 0, len = iterable.length; index < len; index++) {
        // 闭包保存index值
        ;(function (i) {
          Promise.resolve(iterable[i]).then(function (value) {
            count++
            results[i] = value
            if (count === len) {
              resolve(results)
            }
          }, function (e) {
            reject(e)
          })
        })(index)
      }
    })
  }

  /**
   * race方法
   * 如果有一个Promise reject则直接拒绝
   * 未兼容所有Iterable，只支持Array
   * @param {Iterable} iterable
   * @return {Promise}
   */
  Promise.race = function (iterable) {
    if (!iterable.length) {
      throw new TypeError('arguments is not an Iterable')
    }

    return new Promise(function (resolve, reject) {
      for (var index = 0, len = iterable.length; index < len; index++) {
        // 闭包保存index值
        ;(function (i) {
          Promise.resolve(iterable[i]).then(function (value) {
            resolve(value)
          }, function (e) {
            reject(e)
          })
        })(index)
      }
    })
  }

  function resolve (promise, value) {
    // 确保resolve只能执行一次
    if (promise._status) {
      return
    }

    promise._status = FULFILLED
    promise._value = value
    
    for (var index = 0, len = promise._resolveCallback.length; index < len; index++) {
      promise._resolveCallback[index](value)
    }
  }

  function reject (promise, reason) {
    if (promise._status) {
      return
    }

    promise._status = REJECTED
    promise._reason = reason

    for (var index = 0, len = promise._rejectCallback.length; index < len; index++) {
      promise._rejectCallback[index](reason)
    }
  }

  /**
   * 生成promise执行栈函数，说明：
   * e.g. promise2 = promise1.then(onFulfilled, onRejected)
   * 根据Promise/A+规范，onFulfilled/onRejected依赖于上一个promise.then()返回的新的promise2
   * 并且针对执行返回值定义了一系列处理流程，所以对onFulfilled/onRejected进行闭包封装处理函数并保存在上一个promise的执行栈中
   * 即规范中的[[Resolve]](promise2, x)
   * @param {Promise} promise promise
   * @param {Any} callback onFulfilled/onRejected
   * @param {'resolve'|'reject'} action 执行状态
   * @return {Function} 放入执行栈中的函数
   */
  function makeCallback (promise, callback, action) {
    // 以下注释x均表示onFulfilled/onRejected函数返回值
    return function (value) {
      var x = null
      // onFulfilled 和 onRejected 都是可选参数，如果不是函数会被忽略，不添加到执行栈中。
      // 并且继承上一个promise的执行状态及执行结果
      if (isFunction(callback)) {
        try {
          x = callback(value)
        } catch (error) {
          reject(promise, error)
        }

        solveProcess(promise, x, action, true)
      } else {
        action === 'resolve'
          ? resolve(promise, value)
          : reject(promise, value)
      }
    }
  }

  /**
   * promise处理流程
   * @param {Promise} promise promise对象
   * @param {Any} x onFulfilled/onRejected 返回值
   * @param {'resolve'|'reject'} action 执行状态
   * @param {Boolean} isCallback 是否创造onFulfilled与onRejected回调
   * isCallback说明：
   * onFulfilled与onRejected函数返回值只有在promise的情况下才可以改变父promise的状态
   * 所以只有在执行报错的时候和返回的promise reject时才会执行父promise的reject函数，所以需要做处理，与构造函数的内的处理区分开
   */
  function solveProcess (promise, x, action, isCallback) {
    if (x === promise) {
      // x与初始promise为同一个Promise，会造成死循环
      var reason = new TypeError('TypeError: A promises callback cannot return that same promise.')
      reject(promise, reason)
    } else if (x instanceof Promise) {
      // 如果x为Promise，则父Promise等待其fulfilled或reject
      x.then(
        function (value) {
          resolve(promise, value)
        },
        function (error) {
          reject(promise, error)
        }
      )
    } else {
      tryThenable(promise, x, action, isCallback)
    }
  }

  /**
   * promise处理流程中针对x为thenable的处理流程
   * @param {Promise} promise promise对象
   * @param {Any} x onFulfilled/onRejected 返回值
   * @param {'resolve'|'reject'} action 执行状态
   * @param {Boolean} isCallback 是否创造onFulfilled与onRejected回调
   */
  function tryThenable (promise, x, action, isCallback) {
    // x为对象或函数
    if (objectOrFunction(x)) {
      var then = null
      try {
        then = x.then
      } catch (error) {
        reject(promise, error)
      }

      if (isFunction(then)) {
        var sealed = false
        try {
          then.call(
            x,
            /* eslint-disable no-undef */
            function resolvePromise (y) {
              if (sealed) return
              sealed = true
              tryThenable(promise, y)
            },
            function rejectPromise (e) {
              if (sealed) return
              sealed = true
              reject(promise, y)
            }
          )
        } catch (error) {
          reject(promise, error)
        }
      } else {
        action === 'resolve' || isCallback
          ? resolve(promise, x)
          : reject(promise, x)
      }
    } else {
      action === 'resolve' || isCallback
        ? resolve(promise, x)
        : reject(promise, x)
    }
  }

  function isFunction (fn) {
    return typeof fn === 'function'
  }

  // 无操作
  function noop () {}

  /* eslint-disable no-unused-vars */
  function isArray (arr) {
    return Array.isArray
      ? Array.isArray(arr)
      : Object.prototype.toString.call(arr) === '[object Array]'
  }

  /* eslint-disable no-unused-vars */
  function isMaybeThenable (x) {
    return x !== null && typeof x === 'object'
  }

  function objectOrFunction (x) {
    var type = typeof x
    return x !== null && (type === 'object' || type === 'function')
  }

  return Promise
}, this))
