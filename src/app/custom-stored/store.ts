import { BehaviorSubject, Observable } from 'rxjs';
import { Injectable } from '@angular/core';
import { distinctUntilChanged } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

class HistoryFragment {
  prevState: any;
  nextState: any;
  timeStamp: Date;
  causingEvent: string;

  constructor(prevState: any, nextState: any, causingEvent: string) {
    this.prevState = prevState;
    this.nextState = nextState;
    this.timeStamp = new Date();
    this.causingEvent = causingEvent;
  }
}

@Injectable()
export class Store {
  private state: Object;
  private stateSubject: BehaviorSubject<Object>;
  private history: HistoryFragment[];
  private history$: BehaviorSubject<HistoryFragment[]>;

  constructor() {
    this.state = {};
    this.history = [];
    this.stateSubject = new BehaviorSubject<Object>(this.state);
    this.history$ = new BehaviorSubject<HistoryFragment[]>(this.history);
    this.history$.subscribe(history => {
      if (!environment.production && history.length) {
        console.log(history[history.length - 1]);
      }
    });
    this.updateHistory(null, this.state, 'INITIAL_STATE');
    this.getWholeStateAsObservable().subscribe(state => {
      let prevData = null;
      Object.keys(state).forEach(property => {
        state[property]
          .pipe(
            distinctUntilChanged((prev, curr) => {
              prevData = prev;
              return curr === prev;
            })
          )
          .subscribe(() => {
            this.updateHistory(prevData, state[property].value, `SUBSTATE_CHANGED_IN_${property}`);
          });
      });
    });
  }

  register(propertyName: string, property) {
    const prevState = new Object(this.state);
    if (!this.state[propertyName]) {
      const newProperty = new BehaviorSubject<typeof property>(property);
      this.state[propertyName] = newProperty;
      this.updateState();
      this.updateHistory(prevState, this.state, `REGISTERED ${propertyName}`);
    } else {
      this.updateHistory(
        prevState,
        this.state,
        `REGISTRATION_ATTEMPT_ALREADY_REGISTERED ${propertyName}`
      );
    }
  }

  connect(propertyName: string, property): BehaviorSubject<typeof property> {
    const connectedProperty = new BehaviorSubject<typeof property>(property);
    connectedProperty.pipe(distinctUntilChanged()).subscribe(value => {
      this.getSubstate(propertyName).next(value);
    });
    this.getSubstate(propertyName)
      .pipe(distinctUntilChanged())
      .subscribe(value => {
        connectedProperty.next(value);
      });
    this.updateHistory(this.state, this.state, `CONNECTED_READ_WRITE ${propertyName}`);
    return connectedProperty;
  }

  connectAsReadonly(propertyName: string, property): Observable<typeof property> {
    this.updateHistory(this.state, this.state, `CONNECTED_READONLY ${propertyName}`);
    return this.getSubstate(propertyName).asObservable();
  }

  deleteSubstate(propertyName: string) {
    const prevState = new Object(this.state);
    if (this.state[propertyName]) {
      this.getSubstate(propertyName).observers.forEach(observer => observer.complete());
      this.getSubstate(propertyName).complete();
      delete this.state[propertyName];
      this.updateState();
      this.updateHistory(prevState, this.state, `SUBSTATE ${propertyName} DELETED`);
    }
  }

  emptyState() {
    const prevState = new Object(this.state);
    this.state = {};
    this.updateState();
    this.updateHistory(prevState, this.state, 'STATE_EMPTIED');
  }

  getWholeState(): Object {
    return this.stateSubject.value;
  }

  getWholeStateAsObservable(): Observable<Object> {
    return this.stateSubject.asObservable();
  }

  private getSubstate(propertyName: string): BehaviorSubject<any> {
    return this.state[propertyName];
  }

  private updateState() {
    this.stateSubject.next(this.state);
  }

  private updateHistory(prevState: any, nextState: any, causingEvent: string) {
    this.history.push(new HistoryFragment(prevState, nextState, causingEvent));
    this.history$.next(this.history);
  }
}
