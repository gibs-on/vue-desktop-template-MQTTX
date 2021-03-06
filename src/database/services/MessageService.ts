import { Service } from 'typedi'
import { InjectRepository } from 'typeorm-typedi-extensions'
import MessageEntity from '../models/MessageEntity'
import ConnectionEntity from '../models/ConnectionEntity'
import { Repository } from 'typeorm'
import time from '@/utils/time'

@Service()
export default class MessageService {
  constructor(
    @InjectRepository(MessageEntity)
    private messageRepository: Repository<MessageEntity>,
    @InjectRepository(ConnectionEntity)
    private connectionRepository: Repository<ConnectionEntity>,
  ) {}

  public static modelToEntity(model: MessageModel, connectionId: string | undefined): MessageEntity {
    return {
      ...model,
      connectionId,
      payloadFormatIndicator: model.properties?.payloadFormatIndicator,
      messageExpiryInterval: model.properties?.messageExpiryInterval,
      topicAlias: model.properties?.topicAlias,
      responseTopic: model.properties?.responseTopic,
      correlationData: model.properties?.correlationData,
      subscriptionIdentifier: model.properties?.subscriptionIdentifier,
      contentType: model.properties?.contentType,
      userProperties: JSON.stringify(model.properties?.userProperties),
    } as MessageEntity
  }

  public static entityToModel(entity: MessageEntity): MessageModel {
    return {
      ...entity,
      properties: {
        ...entity,
        userProperties: entity.userProperties ? JSON.parse(entity.userProperties) : undefined,
      },
    } as MessageModel
  }

  public async addPushProp(properties: MessageModel['properties'], connectionId: string) {
    if (!properties) return
    const query = await this.connectionRepository.findOne(connectionId)
    if (!query) {
      return
    }
    const updateAt = time.getNowDate()
    this.connectionRepository.update(connectionId, {
      ...query,
      pushPropsPayloadFormatIndicator: properties?.payloadFormatIndicator,
      pushPropsMessageExpiryInterval: properties?.messageExpiryInterval,
      pushPropsTopicAlias: properties?.topicAlias,
      pushPropsResponseTopic: properties?.responseTopic,
      pushPropsCorrelationData: properties?.correlationData?.toString(),
      pushPropsUserProperties: JSON.stringify(properties?.userProperties),
      pushPropsSubscriptionIdentifier: properties?.subscriptionIdentifier,
      pushPropsContentType: properties?.contentType,
      updateAt,
    })
  }

  public async getPushProp(connectionId: string): Promise<MessageModel['properties'] | undefined> {
    const query = await this.connectionRepository.findOne(connectionId)
    if (!query) {
      return
    }
    return {
      payloadFormatIndicator: query.pushPropsPayloadFormatIndicator,
      messageExpiryInterval: query.pushPropsMessageExpiryInterval,
      topicAlias: query.pushPropsTopicAlias,
      responseTopic: query.pushPropsResponseTopic,
      correlationData: query.pushPropsCorrelationData,
      userProperties: query.pushPropsUserProperties ? JSON.parse(query.pushPropsUserProperties) : undefined,
      subscriptionIdentifier: query.pushPropsSubscriptionIdentifier,
      contentType: query.pushPropsContentType,
    } as MessageModel['properties']
  }

  public async pushToConnection(message: MessageModel, connectionId: string): Promise<MessageModel | undefined> {
    const query: MessageEntity | undefined = await this.messageRepository.findOne(message.id)
    if (!query) {
      return await this.messageRepository.save(MessageService.modelToEntity({ ...message }, connectionId))
    }
    return await this.messageRepository.save(MessageService.modelToEntity({ ...query, ...message }, connectionId))
  }

  public async delete(id: string): Promise<MessageModel | undefined> {
    const query = await this.messageRepository.findOne(id)
    if (!query || !query.id) {
      return
    }
    await this.messageRepository.delete(query.id)
    return query
  }

  public async cleanInConnection(connectionId: string) {
    const query: MessageEntity[] | undefined = await this.messageRepository
      .createQueryBuilder('ms')
      .where('ms.connectionId = :connectionId', { connectionId })
      .getMany()
    if (!query || !query.length) {
      return
    }
    const deleteID: string[] = []
    query.forEach((entity) => {
      entity.id && deleteID.push(entity.id)
    })
    if (!deleteID.length) {
      return
    }
    await this.messageRepository.delete(deleteID)
  }
}
